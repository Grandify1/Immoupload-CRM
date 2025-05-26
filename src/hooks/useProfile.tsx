import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  team_id: string | null;
}

interface Team {
  id: string;
  name: string;
}

const useProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const profileSubscription = useRef<any>(null);
  const isFetching = useRef(false);
  const retryCount = useRef(0);
  const maxRetries = 3;
  const mounted = useRef(true);
  const lastFetchTime = useRef<number>(0);
  const lastUserId = useRef<string | null>(null);
  const FETCH_COOLDOWN = 2000; // 2 seconds cooldown between fetches

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (profileSubscription.current) {
        supabase.removeChannel(profileSubscription.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) {
      if (mounted.current) {
        setProfile(null);
        setTeam(null);
        setLoading(false);
      }
      return;
    }

    // Skip if we already have the profile for this user
    if (user.id === lastUserId.current && profile) {
      console.log('Skipping profile fetch - already have data for this user');
      return;
    }

    const setupSubscription = () => {
      if (profileSubscription.current) {
        supabase.removeChannel(profileSubscription.current);
      }

      profileSubscription.current = supabase
        .channel(`profiles:id=eq.${user.id}`)
        .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
            (payload) => {
              if (!mounted.current) return;
              
              console.log('Profile update received!', payload);
              const oldTeamId = (payload.old as Profile).team_id;
              const newTeamId = (payload.new as Profile).team_id;

              if (oldTeamId !== newTeamId) {
                console.log('Team ID changed, re-fetching profile...');
                fetchProfile();
              } else {
                console.log('Other profile data changed, updating profile state...');
                setProfile(payload.new as Profile);
              }
            }
        )
        .subscribe();
    };
    
    setupSubscription();
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user || !mounted.current) return;
    
    const now = Date.now();
    if (now - lastFetchTime.current < FETCH_COOLDOWN) {
      console.log('Profile fetch cooldown active, skipping...');
      return;
    }
    
    if (isFetching.current) {
      console.log('Profile fetch already in progress, skipping...');
      return;
    }

    // Skip if we already have the profile for this user
    if (user.id === lastUserId.current && profile) {
      console.log('Skipping profile fetch - already have data for this user');
      return;
    }

    isFetching.current = true;
    lastFetchTime.current = now;
    lastUserId.current = user.id;
    
    if (mounted.current) {
      setLoading(true);
    }
    
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*, teams(*)')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error(`Error fetching profile: ${profileError.message}`, profileError);
        
        if (retryCount.current < maxRetries) {
          retryCount.current += 1;
          console.log(`Retrying profile fetch (${retryCount.current}/${maxRetries})...`);
          setTimeout(fetchProfile, 1000 * retryCount.current);
          return;
        }
        
        if (mounted.current) {
          setProfile(null);
          setTeam(null);
        }
        return;
      }

      retryCount.current = 0;
      
      if (mounted.current) {
        setProfile(profileData);
        setTeam(profileData?.team_id ? (profileData.teams as Team | null) : null);
      }
    } catch (error) {
      console.error('An unexpected error occurred while fetching profile:', error);
      if (mounted.current) {
        setProfile(null);
        setTeam(null);
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
      isFetching.current = false;
    }
  };

  const createTeam = async (teamName: string) => {
    if (!user || !profile) return;

    try {
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert({ name: teamName })
        .select()
        .single();

      if (teamError) throw teamError;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ team_id: teamData.id })
        .eq('id', user.id);

      if (updateError) throw updateError;

      if (mounted.current) {
        setTeam(teamData);
        setProfile({ ...profile, team_id: teamData.id });
      }
      
      return teamData;
    } catch (error) {
      console.error('Error creating team:', error);
      throw error;
    }
  };

  return {
    profile,
    team,
    loading,
    createTeam,
    refetch: fetchProfile,
  };
};

export { useProfile };
