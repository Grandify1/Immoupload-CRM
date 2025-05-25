
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';

interface TeamSetupProps {
  onTeamCreated: () => void;
}

export const TeamSetup: React.FC<TeamSetupProps> = ({ onTeamCreated }) => {
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const { createTeam } = useProfile();

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setLoading(true);
    try {
      await createTeam(teamName.trim());
      onTeamCreated();
    } catch (error) {
      console.error('Error creating team:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create Your Team</CardTitle>
          <CardDescription>
            You need to be part of a team to continue. Create a new team to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teamName">Team Name</Label>
              <Input
                id="teamName"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Your Company Name"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !teamName.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Team
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
