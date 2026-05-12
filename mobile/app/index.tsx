import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase/client';

// Boot route: redirect to /login or /inspections based on session.
export default function Index() {
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      router.replace(data.session ? '/inspections' : '/login');
    })();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color="#4ea1ff" />
    </View>
  );
}
