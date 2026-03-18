import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Switch
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const TIME_SLOTS = ['06:00','07:00','08:00','09:00','10:00','12:00','14:00','16:00','18:00','20:00','21:00','22:00'];
const FREQUENCIES = ['Once daily','Twice daily','Three times daily','With meals','As needed'];

export default function MedicinesScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '', dosage: '', frequency: 'Once daily',
    scheduleTimes: ['08:00'], stockCount: '', refillAt: '5',
  });
  const qc = useQueryClient();

  const { data: medicines } = useQuery({
    queryKey: ['medicines'],
    queryFn: () => api.get('/reminders/medicines').then((r: any) => r.data),
  });

  const { data: todayMeds } = useQuery({
    queryKey: ['medicines-today'],
    queryFn: () => api.get('/reminders/medicines/today').then((r: any) => r.data),
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => api.post('/reminders/medicines', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicines-today'] });
      setShowAdd(false);
      setForm({ name:'', dosage:'', frequency:'Once daily', scheduleTimes:['08:00'], stockCount:'', refillAt:'5' });
      Alert.alert('Added!', 'Medicine added and reminders set.');
    },
  });

  const intakeMutation = useMutation({
    mutationFn: ({ medId, status, time }: any) =>
      api.post('/reminders/medicines/log-intake', { medicine_id: medId, status, scheduled_time: time }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medicines-today'] }),
  });

  const submitAdd = () => {
    if (!form.name || !form.dosage) { Alert.alert('Missing fields', 'Name and dosage required'); return; }
    addMutation.mutate({
      name: form.name, dosage: form.dosage, frequency: form.frequency,
      schedule_times: form.scheduleTimes,
      stock_count: parseInt(form.stockCount) || 0,
      refill_alert_at: parseInt(form.refillAt) || 5,
    });
  };

  const toggleTime = (t: string) => {
    setForm(f => ({
      ...f,
      scheduleTimes: f.scheduleTimes.includes(t)
        ? f.scheduleTimes.filter(x => x !== t)
        : [...f.scheduleTimes, t].sort()
    }));
  };

  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'short' });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Medicines</Text>
          <Text style={styles.sub}>{today}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Today's Schedule */}
      {todayMeds && todayMeds.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          {todayMeds.map((log: any) => {
            const med = log.medicines || {};
            const time = new Date(log.scheduled_time).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
            return (
              <View key={log.id} style={[styles.scheduleCard, log.status === 'taken' && styles.takenCard]}>
                <View style={styles.scheduleLeft}>
                  <Text style={styles.scheduleTime}>{time}</Text>
                  <View>
                    <Text style={styles.schedMedName}>{med.name}</Text>
                    <Text style={styles.schedMedDose}>{med.dosage}</Text>
                    {med.stock_count <= (med.refill_alert_at || 5) && (
                      <Text style={styles.lowStockWarn}>⚠ Only {med.stock_count} left — refill soon</Text>
                    )}
                  </View>
                </View>
                {log.status === 'taken' ? (
                  <Text style={styles.takenBadge}>✓ Taken</Text>
                ) : (
                  <View style={styles.actionBtns}>
                    <TouchableOpacity
                      style={styles.takenBtn}
                      onPress={() => intakeMutation.mutate({ medId: log.medicine_id, status: 'taken', time: log.scheduled_time })}
                    >
                      <Text style={styles.takenBtnText}>Taken</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.skipBtn}
                      onPress={() => intakeMutation.mutate({ medId: log.medicine_id, status: 'missed', time: log.scheduled_time })}
                    >
                      <Text style={styles.skipBtnText}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Medicine inventory */}
      <Text style={styles.sectionTitle}>My Medicines</Text>
      {medicines?.map((med: any) => (
        <View key={med.id} style={[styles.medCard, med.low_stock && styles.medCardLow]}>
          <View style={styles.medHeader}>
            <Text style={styles.medName}>{med.name}</Text>
            {med.low_stock && <Text style={styles.lowBadge}>⚠ Low Stock</Text>}
          </View>
          <Text style={styles.medDose}>{med.dosage}  ·  {med.frequency}</Text>
          <View style={styles.medFooter}>
            <Text style={styles.medStock}>📦 Stock: {med.stock_count} {med.stock_unit}</Text>
            <Text style={styles.medTimes}>⏰ {med.schedule_times?.join(', ')}</Text>
          </View>
        </View>
      ))}

      {/* Add Medicine Modal */}
      {showAdd && (
        <View style={styles.addPanel}>
          <Text style={styles.panelTitle}>Add New Medicine</Text>
          <TextInput style={styles.input} placeholder="Medicine name*" value={form.name}
            onChangeText={v => setForm(f => ({...f, name: v}))} placeholderTextColor={Colors.textMuted} />
          <TextInput style={styles.input} placeholder="Dosage (e.g. 500mg, 1 tablet)*" value={form.dosage}
            onChangeText={v => setForm(f => ({...f, dosage: v}))} placeholderTextColor={Colors.textMuted} />

          <Text style={styles.fieldLabel}>Frequency</Text>
          <View style={styles.chipRow}>
            {FREQUENCIES.map(f => (
              <TouchableOpacity key={f} style={[styles.chip, form.frequency === f && styles.chipActive]}
                onPress={() => setForm(prev => ({...prev, frequency: f}))}>
                <Text style={[styles.chipText, form.frequency === f && styles.chipActiveText]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Schedule Times</Text>
          <View style={styles.chipRow}>
            {TIME_SLOTS.map(t => (
              <TouchableOpacity key={t} style={[styles.chip, form.scheduleTimes.includes(t) && styles.chipActive]}
                onPress={() => toggleTime(t)}>
                <Text style={[styles.chipText, form.scheduleTimes.includes(t) && styles.chipActiveText]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.stockRow}>
            <View style={{flex:1}}>
              <Text style={styles.fieldLabel}>Current Stock</Text>
              <TextInput style={styles.input} placeholder="0" keyboardType="numeric"
                value={form.stockCount} onChangeText={v => setForm(f => ({...f, stockCount: v}))}
                placeholderTextColor={Colors.textMuted} />
            </View>
            <View style={{flex:1, marginLeft: 12}}>
              <Text style={styles.fieldLabel}>Alert when below</Text>
              <TextInput style={styles.input} placeholder="5" keyboardType="numeric"
                value={form.refillAt} onChangeText={v => setForm(f => ({...f, refillAt: v}))}
                placeholderTextColor={Colors.textMuted} />
            </View>
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={submitAdd} disabled={addMutation.isPending}>
            <Text style={styles.submitText}>{addMutation.isPending ? 'Adding...' : 'Add Medicine'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowAdd(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex:1, backgroundColor: Colors.background },
  container: { padding:20, paddingTop:56, paddingBottom:48 },
  headerRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 },
  title: { fontSize:26, fontWeight:'700', color:Colors.text },
  sub: { fontSize:12, color:Colors.textMuted, marginTop:3 },
  addBtn: { backgroundColor:Colors.primary, borderRadius:10, paddingHorizontal:16, paddingVertical:10 },
  addBtnText: { color:'#fff', fontSize:14, fontWeight:'600' },
  sectionTitle: { fontSize:15, fontWeight:'700', color:Colors.text, marginBottom:12, marginTop:8 },
  scheduleCard: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:Colors.card, borderRadius:14, padding:16, marginBottom:10, borderWidth:1, borderColor:Colors.border },
  takenCard: { opacity:0.6 },
  scheduleLeft: { flexDirection:'row', alignItems:'center', gap:14, flex:1 },
  scheduleTime: { fontSize:14, fontWeight:'700', color:Colors.primary, minWidth:50 },
  schedMedName: { fontSize:14, fontWeight:'600', color:Colors.text },
  schedMedDose: { fontSize:12, color:Colors.textMuted },
  lowStockWarn: { fontSize:10, color:Colors.accent, marginTop:2 },
  actionBtns: { flexDirection:'row', gap:8 },
  takenBtn: { backgroundColor:Colors.primary, borderRadius:8, paddingHorizontal:14, paddingVertical:8 },
  takenBtnText: { color:'#fff', fontSize:12, fontWeight:'700' },
  skipBtn: { borderWidth:1, borderColor:Colors.border, borderRadius:8, paddingHorizontal:14, paddingVertical:8 },
  skipBtnText: { color:Colors.textMuted, fontSize:12 },
  takenBadge: { fontSize:13, color:Colors.success, fontWeight:'700' },
  medCard: { backgroundColor:Colors.card, borderRadius:14, padding:16, marginBottom:10, borderWidth:1, borderColor:Colors.border },
  medCardLow: { borderColor:Colors.warning, backgroundColor:'#FFFBF0' },
  medHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  medName: { fontSize:15, fontWeight:'700', color:Colors.text },
  lowBadge: { fontSize:11, color:Colors.warning, fontWeight:'700' },
  medDose: { fontSize:13, color:Colors.textMuted, marginBottom:8 },
  medFooter: { flexDirection:'row', justifyContent:'space-between' },
  medStock: { fontSize:12, color:Colors.textMuted },
  medTimes: { fontSize:12, color:Colors.textMuted },
  addPanel: { backgroundColor:Colors.card, borderRadius:20, padding:22, marginTop:20, borderWidth:1, borderColor:Colors.border },
  panelTitle: { fontSize:17, fontWeight:'700', color:Colors.text, marginBottom:18 },
  input: { borderWidth:1, borderColor:Colors.border, borderRadius:10, padding:14, fontSize:15, color:Colors.text, backgroundColor:Colors.background, marginBottom:14 },
  fieldLabel: { fontSize:13, fontWeight:'600', color:Colors.textMuted, marginBottom:8, marginTop:4 },
  chipRow: { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:14 },
  chip: { paddingHorizontal:12, paddingVertical:7, borderRadius:20, borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.background },
  chipActive: { borderColor:Colors.primary, backgroundColor:`${Colors.primary}15` },
  chipText: { fontSize:12, color:Colors.textMuted },
  chipActiveText: { color:Colors.primary, fontWeight:'600' },
  stockRow: { flexDirection:'row', gap:0 },
  submitBtn: { backgroundColor:Colors.primary, borderRadius:12, padding:16, alignItems:'center', marginTop:8 },
  submitText: { color:'#fff', fontSize:15, fontWeight:'700' },
  cancelText: { color:Colors.textMuted, textAlign:'center', marginTop:14, fontSize:13 },
});
