import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const retryCount = useRef(0);
  const maxRetries = 3;
  const mounted = useRef(true);
  const authSubscription = useRef<any>(null);
  const lastSessionId = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;

    const initializeAuth = async () => {
      try {
        // Cleanup existing subscription
        if (authSubscription.current) {
          authSubscription.current.unsubscribe();
        }

        // Set up auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, currentSession) => {
            if (!mounted.current) return;
            
            const currentSessionId = currentSession?.user?.id;
            
            // Skip if we already have this session
            if (event === 'INITIAL_SESSION' && currentSessionId === lastSessionId.current) {
              console.log('Skipping duplicate INITIAL_SESSION event');
              return;
            }
            
            console.log('Auth state changed:', event, currentSessionId);
            
            if (event === 'INITIAL_SESSION') {
              // Only update state if we don't already have a session
              if (!session) {
                setSession(currentSession);
                setUser(currentSession?.user ?? null);
                lastSessionId.current = currentSessionId;
              }
            } else {
              setSession(currentSession);
              setUser(currentSession?.user ?? null);
              lastSessionId.current = currentSessionId;
            }
            
            setLoading(false);
            retryCount.current = 0;
          }
        );
        
        authSubscription.current = subscription;

        // Check for existing session
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          if (retryCount.current < maxRetries) {
            retryCount.current += 1;
            console.log(`Retrying auth initialization (${retryCount.current}/${maxRetries})...`);
            setTimeout(initializeAuth, 1000 * retryCount.current);
            return;
          }
        }

        if (mounted.current) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          lastSessionId.current = currentSession?.user?.id ?? null;
          setLoading(false);
        }
      } catch (error) {
        console.error('Unexpected error in auth initialization:', error);
        if (mounted.current) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      mounted.current = false;
      if (authSubscription.current) {
        authSubscription.current.unsubscribe();
      }
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      if (mounted.current) {
        setUser(null);
        setSession(null);
        lastSessionId.current = null;
      }
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return {
    user,
    session,
    loading,
    signOut,
  };
};

export { useAuth };
