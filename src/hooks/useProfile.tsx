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
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        console.error(`Error fetching user: ${userError.message}`, userError);
        setLoading(false);
        return;
      }

      const user = userData?.user;

      if (user) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*, teams(*)') // Select team data as well
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error(`Error fetching profile: ${profileError.message}`, profileError);
          setLoading(false);
          return;
        }

        setProfile(profileData);
        setTeam(profileData?.teams as Team | null); // Set team data
      } else {
        setProfile(null);
        setTeam(null);
      }
    } catch (error) {
      console.error('An unexpected error occurred while fetching profile:', error);
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
