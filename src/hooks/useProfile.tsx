
import { useState, useEffect } from 'react';
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

export const useProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchProfile();
    } else {
      setProfile(null);
      setTeam(null);
      setLoading(false);
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      setProfile(profileData);

      if (profileData.team_id) {
        const { data: teamData, error: teamError } = await supabase
          .from('teams')
          .select('*')
          .eq('id', profileData.team_id)
          .single();

        if (teamError) throw teamError;
        setTeam(teamData);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const createTeam = async (teamName: string) => {
    if (!user || !profile) return;

    try {
      // Create team
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert({ name: teamName })
        .select()
        .single();

      if (teamError) throw teamError;

      // Update profile with team_id
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ team_id: teamData.id })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setTeam(teamData);
      setProfile({ ...profile, team_id: teamData.id });
      
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
