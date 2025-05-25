
import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { LeadsView } from './LeadsView';
import { OpportunitiesView } from './OpportunitiesView';
import { ReportsView } from './ReportsView';
import { LeadDetail } from './LeadDetail';
import { DealDetail } from './DealDetail';
import { Lead, Deal, Activity, SavedFilter } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';

const CRMLayout = () => {
  const { team } = useProfile();
  const { toast } = useToast();
  
  const [activeSection, setActiveSection] = useState<'leads' | 'opportunities' | 'reports'>('leads');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [currentFilters, setCurrentFilters] = useState<Record<string, any>>({});
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (team) {
      fetchData();
    }
  }, [team]);

  const fetchData = async () => {
    if (!team) return;
    
    setLoading(true);
    try {
      await Promise.all([
        fetchLeads(),
        fetchDeals(),
        fetchSavedFilters()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async () => {
    if (!team) return;
    
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('team_id', team.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
      return;
    }

    setLeads(data || []);
  };

  const fetchDeals = async () => {
    if (!team) return;
    
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('team_id', team.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching deals:', error);
      return;
    }

    setDeals(data || []);
  };

  const fetchSavedFilters = async () => {
    if (!team) return;
    
    const { data, error } = await supabase
      .from('saved_filters')
      .select('*')
      .eq('team_id', team.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching saved filters:', error);
      return;
    }

    setSavedFilters(data || []);
  };

  const addActivity = async (entityType: 'lead' | 'deal', entityId: string, activity: Omit<Activity, 'id' | 'team_id' | 'created_at'>) => {
    if (!team) return;

    const { data, error } = await supabase
      .from('activities')
      .insert({
        ...activity,
        team_id: team.id,
        entity_type: entityType,
        entity_id: entityId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding activity:', error);
      toast({
        title: "Error",
        description: "Failed to add activity",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Activity added successfully",
    });

    return data;
  };

  const updateLead = async (leadId: string, updates: Partial<Lead>) => {
    if (!team) return;

    const { data, error } = await supabase
      .from('leads')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .eq('team_id', team.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating lead:', error);
      toast({
        title: "Error",
        description: "Failed to update lead",
        variant: "destructive",
      });
      return;
    }

    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? data : lead
    ));

    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead(data);
    }

    toast({
      title: "Success",
      description: "Lead updated successfully",
    });
  };

  const updateDeal = async (dealId: string, updates: Partial<Deal>) => {
    if (!team) return;

    const { data, error } = await supabase
      .from('deals')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', dealId)
      .eq('team_id', team.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating deal:', error);
      toast({
        title: "Error",
        description: "Failed to update deal",
        variant: "destructive",
      });
      return;
    }

    setDeals(prev => prev.map(deal => 
      deal.id === dealId ? data : deal
    ));

    if (selectedDeal && selectedDeal.id === dealId) {
      setSelectedDeal(data);
    }

    toast({
      title: "Success",
      description: "Deal updated successfully",
    });
  };

  const convertLeadToDeal = async (lead: Lead) => {
    if (!team) return;

    try {
      // Create deal from lead
      const { data: dealData, error: dealError } = await supabase
        .from('deals')
        .insert({
          team_id: team.id,
          name: lead.name,
          status: 'lead',
          value: 0,
          lead_id: lead.id,
          owner_id: lead.owner_id,
          custom_fields: lead.custom_fields,
        })
        .select()
        .single();

      if (dealError) throw dealError;

      // Update lead status
      await updateLead(lead.id, { status: 'qualified' });

      setDeals(prev => [dealData, ...prev]);
      setSelectedLead(null);
      setSelectedDeal(dealData);
      setActiveSection('opportunities');

      toast({
        title: "Success",
        description: "Lead converted to deal successfully",
      });
    } catch (error) {
      console.error('Error converting lead to deal:', error);
      toast({
        title: "Error",
        description: "Failed to convert lead to deal",
        variant: "destructive",
      });
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </div>
      );
    }

    switch (activeSection) {
      case 'leads':
        return (
          <LeadsView
            leads={leads}
            view={view}
            onViewChange={setView}
            filters={currentFilters}
            onLeadSelect={setSelectedLead}
            onLeadUpdate={updateLead}
            onRefresh={fetchLeads}
          />
        );
      case 'opportunities':
        return (
          <OpportunitiesView
            deals={deals}
            view={view}
            onViewChange={setView}
            filters={currentFilters}
            onDealSelect={setSelectedDeal}
            onDealUpdate={updateDeal}
            onRefresh={fetchDeals}
          />
        );
      case 'reports':
        return <ReportsView leads={leads} deals={deals} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        savedFilters={savedFilters}
        currentFilters={currentFilters}
        onFilterSelect={(filters) => setCurrentFilters(filters)}
      />
      
      <div className="flex-1 flex min-w-0">
        {renderContent()}
        
        {selectedLead && (
          <LeadDetail
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onAddActivity={(activity) => addActivity('lead', selectedLead.id, activity)}
            onUpdateLead={updateLead}
            onConvertToDeal={() => convertLeadToDeal(selectedLead)}
            allLeads={leads}
            onLeadSelect={setSelectedLead}
          />
        )}

        {selectedDeal && (
          <DealDetail
            deal={selectedDeal}
            onClose={() => setSelectedDeal(null)}
            onAddActivity={(activity) => addActivity('deal', selectedDeal.id, activity)}
            onUpdateDeal={updateDeal}
            allDeals={deals}
            onDealSelect={setSelectedDeal}
          />
        )}
      </div>
    </div>
  );
};

export default CRMLayout;
