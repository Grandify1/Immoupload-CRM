console.log('SalesPipelineSettings.tsx: Datei wird verarbeitet');

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus } from 'lucide-react';

const SalesPipelineSettings: React.FC = () => {
  console.log('SalesPipelineSettings: Komponente wird gerendert');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadStatuses = async () => {
    console.log('loadStatuses: Start');
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('allowed_deal_statuses')
        .select('*')
        .order('status');

      if (error) {
        console.error('Fehler beim Laden:', error);
        throw error;
      }

      if (!data) {
        console.log('Keine Daten gefunden');
        setStatuses([]);
        return;
      }

      const uniqueStatuses = data.map(row => row.status);
      console.log('Geladene Stati:', uniqueStatuses);
      setStatuses(uniqueStatuses);
      console.log('loadStatuses: Stati im State gesetzt', uniqueStatuses);
    } catch (error) {
      console.error('Fehler beim Laden der Stati:', error);
      toast({
        title: 'Fehler',
        description: 'Die Stati konnten nicht geladen werden.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddStatus = async () => {
    if (!newStatus.trim()) {
      toast({
        title: 'Fehler',
        description: 'Bitte geben Sie einen Status ein.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Prüfe zuerst, ob der Status bereits existiert
      const { data: existingStatus } = await supabase
        .from('allowed_deal_statuses')
        .select('status')
        .eq('status', newStatus.trim())
        .single();

      if (existingStatus) {
        toast({
          title: 'Fehler',
          description: 'Dieser Status existiert bereits.',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('allowed_deal_statuses')
        .insert([{ status: newStatus.trim() }]);

      if (error) throw error;

      // Sofort neu laden
      await loadStatuses();
      setNewStatus('');
      
      toast({
        title: 'Erfolg',
        description: 'Der neue Status wurde hinzugefügt.',
      });
    } catch (error) {
      console.error('Fehler beim Hinzufügen:', error);
      toast({
        title: 'Fehler',
        description: 'Der Status konnte nicht hinzugefügt werden.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveStatus = async (statusToRemove: string) => {
    setIsLoading(true);
    try {
      // Prüfe, ob der Status noch verwendet wird
      const { data: deals, error: countError } = await supabase
        .from('deals')
        .select('id')
        .eq('status', statusToRemove);

      if (countError) {
        console.error('handleRemoveStatus: Fehler beim Prüfen auf Deals', countError);
        throw countError;
      }

      if (deals && deals.length > 0) {
        console.log('handleRemoveStatus: Status wird noch verwendet', statusToRemove, deals.length);
        toast({
          title: 'Fehler',
          description: 'Dieser Status wird noch von Deals verwendet und kann nicht entfernt werden.',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('allowed_deal_statuses')
        .delete()
        .eq('status', statusToRemove);

      if (error) throw error;

      await loadStatuses();
      
      toast({
        title: 'Erfolg',
        description: 'Der Status wurde entfernt.',
      });
    } catch (error) {
      console.error('Fehler beim Entfernen:', error);
      toast({
        title: 'Fehler',
        description: 'Der Status konnte nicht entfernt werden.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log('useEffect: Komponente gemounted, lade Stati...');
    loadStatuses();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Pipeline Einstellungen</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium mb-4">Verfügbare Status</h3>
            {isLoading ? (
              <div className="text-center py-4">Lade Stati...</div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {statuses.map((status) => (
                  <div key={status} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <Badge variant="secondary">{status}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveStatus(status)}
                      className="text-red-500 hover:text-red-700"
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-medium mb-4">Neuen Status hinzufügen</h3>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="newStatus">Status Name</Label>
                <Input
                  id="newStatus"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  placeholder="Neuer Status"
                  disabled={isLoading}
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleAddStatus} 
                  className="flex items-center gap-2"
                  disabled={isLoading}
                >
                  <Plus className="h-4 w-4" />
                  Hinzufügen
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SalesPipelineSettings;
