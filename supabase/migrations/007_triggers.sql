-- Auto-update profile updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER patient_profiles_updated_at BEFORE UPDATE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate BMI when height/weight changes
CREATE OR REPLACE FUNCTION calculate_bmi()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.height_cm IS NOT NULL AND NEW.weight_kg IS NOT NULL AND NEW.height_cm > 0 THEN
    NEW.bmi = ROUND((NEW.weight_kg / POWER(NEW.height_cm / 100.0, 2))::NUMERIC, 2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_bmi BEFORE INSERT OR UPDATE OF height_cm, weight_kg ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION calculate_bmi();

-- Auto-flag critical vitals
CREATE OR REPLACE FUNCTION flag_critical_vitals()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.systolic_bp > 180 OR NEW.diastolic_bp > 120) OR
     (NEW.blood_sugar_fasting > 300) OR
     (NEW.spo2 IS NOT NULL AND NEW.spo2 < 90) OR
     (NEW.heart_rate > 150 OR NEW.heart_rate < 40) THEN
    NEW.risk_level = 'critical';
    NEW.flagged = TRUE;
  ELSIF (NEW.systolic_bp > 140 OR NEW.diastolic_bp > 90) OR
        (NEW.blood_sugar_fasting > 200) OR
        (NEW.spo2 IS NOT NULL AND NEW.spo2 < 95) THEN
    NEW.risk_level = 'warning';
    NEW.flagged = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vitals_flag BEFORE INSERT OR UPDATE ON public.vitals_logs
  FOR EACH ROW EXECUTE FUNCTION flag_critical_vitals();
