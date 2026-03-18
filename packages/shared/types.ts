export type UserRole = 'patient' | 'doctor' | 'admin';
export type Specialty = 
  | 'general' | 'cardiology' | 'orthopedics' | 'gastroenterology'
  | 'urology' | 'dermatology' | 'ent' | 'ophthalmology' | 'neurology'
  | 'endocrinology' | 'pulmonology' | 'nephrology' | 'psychiatry';

export type ChronicCondition =
  | 'diabetes_type1' | 'diabetes_type2' | 'hypertension' | 'heart_disease'
  | 'thyroid' | 'asthma' | 'arthritis' | 'obesity' | 'none';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}
