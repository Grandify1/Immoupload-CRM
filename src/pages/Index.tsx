import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthLayout } from '@/components/AuthLayout';
import { TeamSetup } from '@/components/TeamSetup';
import CRMLayout from '@/components/CRMLayout';
import { Loader2 } from 'lucide-react';
import { LeadsView } from '@/components/LeadsView';
import { OpportunitiesView } from '@/components/OpportunitiesView';
import { EmailView } from '@/components/EmailView';
import { ReportsView } from '@/components/ReportsView';
import { SettingsView } from '@/components/SettingsView';

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const { profile, team, loading: profileLoading, refetch } = useProfile();
  const [activeSection, setActiveSection] = useState<'leads' | 'opportunities' | 'reports' | 'settings' | 'email'>('leads');

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

  return (
    <CRMLayout activeSection={activeSection} setActiveSection={setActiveSection}>
      {activeSection === 'leads' && <LeadsView />}
      {activeSection === 'opportunities' && <OpportunitiesView />}
      {activeSection === 'email' && <EmailView />}
      {activeSection === 'reports' && <ReportsView />}
      {activeSection === 'settings' && <SettingsView />}
    </CRMLayout>
  );
};

export default Index;