
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthLayout } from '@/components/AuthLayout';
import { TeamSetup } from '@/components/TeamSetup';
import CRMLayout from '@/components/CRMLayout';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const { profile, team, loading: profileLoading, refetch } = useProfile();

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthLayout onAuthSuccess={() => window.location.reload()} />;
  }

  if (!team) {
    return <TeamSetup onTeamCreated={refetch} />;
  }

  return <CRMLayout />;
};

export default Index;
