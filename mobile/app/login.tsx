import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase/client';

export default function LoginScreen() {
  const [email, setEmail] = useState('worker@example.com');
  const [password, setPassword] = useState('worker1234');
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      Alert.alert('Sign-in failed', error.message);
      return;
    }
    router.replace('/inspections');
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Workforce' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, padding: 20, justifyContent: 'center' }}
      >
        <Text style={{ color: '#e6e9ec', fontSize: 22, marginBottom: 24 }}>
          Sign in
        </Text>
        <Text style={{ color: '#8a939c', fontSize: 12, marginBottom: 6 }}>
          Email
        </Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={inputStyle}
          placeholderTextColor="#475058"
        />
        <Text style={{ color: '#8a939c', fontSize: 12, marginTop: 16, marginBottom: 6 }}>
          Password
        </Text>
        <TextInput
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={inputStyle}
          placeholderTextColor="#475058"
        />
        <Pressable
          onPress={onSignIn}
          disabled={busy}
          style={{
            backgroundColor: '#4ea1ff',
            paddingVertical: 14,
            borderRadius: 6,
            marginTop: 24,
            alignItems: 'center',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={{ color: '#000', fontWeight: '600' }}>Sign in</Text>
          )}
        </Pressable>
        <Text style={{ color: '#8a939c', fontSize: 11, marginTop: 16, textAlign: 'center' }}>
          Use credentials issued by your admin.
        </Text>
      </KeyboardAvoidingView>
    </>
  );
}

const inputStyle = {
  color: '#e6e9ec',
  borderWidth: 1,
  borderColor: '#1f262d',
  borderRadius: 6,
  padding: 12,
} as const;
