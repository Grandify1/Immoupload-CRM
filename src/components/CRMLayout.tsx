import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { LeadsView } from './LeadsView';
import { OpportunitiesView } from './OpportunitiesView';
import { ReportsView } from './ReportsView';
import { SettingsView } from './SettingsView';
import { LeadDetail } from './LeadDetail';
import { DealDetail } from './DealDetail';
import { Lead, Deal, Activity, SavedFilter, CustomField, ActivityTemplate } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ImportStatusBar from './ImportStatusBar';

const CRMLayout = () => {
  const { team } = useProfile();
  const { toast } = useToast();

  const [activeSection, setActiveSection] = useState<'leads' | 'opportunities' | 'reports' | 'settings'>('leads');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [leadsView, setLeadsView] = useState<'table' | 'kanban'>('table');
  const [opportunitiesView, setOpportunitiesView] = useState<'table' | 'kanban'>('kanban');
  const [currentFilters, setCurrentFilters] = useState<Record<string, any>>({});

  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [activityTemplates, setActivityTemplates] = useState<ActivityTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // Einmaliges Laden der Daten beim Initialisieren der Komponente
  useEffect(() => {
    if (team) {
      console.log('CRMLayout: Initial fetchData call');
      fetchData();
    }
  }, [team]);

  const fetchData = async () => {
    if (!team) {
      console.log('fetchData: No team available, returning.');
      return;
    }

    // Fetch-Prevention: Verhindert parallele Fetches
    if (isFetching) {
      console.log('fetchData: Already fetching, skipping duplicate call');
      return;
    }

    console.log('fetchData: Starting data fetch...');
    setIsFetching(true);
    setLoading(true);
    try {
      // Gleichzeitiges Abrufen von Leads und Aktivitäten
      const [leadsDataResult, activitiesDataResult] = await Promise.all([
        supabase.from('leads').select('*').eq('team_id', team.id).order('updated_at', { ascending: false }),
        supabase.from('activities').select('*').eq('team_id', team.id).order('created_at', { ascending: false })
      ]);

      // Fehlerbehandlung für Leads
      if (leadsDataResult.error) {
        console.error(`Error fetching leads: ${leadsDataResult.error.message}`, leadsDataResult.error);
        toast({
          title: "Error",
          description: "Failed to load leads",
          variant: "destructive",
        });
        // Fortfahren mit leeren Leads, um andere Daten zu laden
        leadsDataResult.data = [];
      }

       // Fehlerbehandlung für Aktivitäten
      if (activitiesDataResult.error) {
        console.error(`Error fetching activities: ${activitiesDataResult.error.message}`, activitiesDataResult.error);
        toast({
          title: "Error",
          description: "Failed to load activities",
          variant: "destructive",
        });
        // Fortfahren mit leeren Aktivitäten
        activitiesDataResult.data = [];
      }

      const leads = (leadsDataResult.data || []) as Lead[];
      const activities = (activitiesDataResult.data || []) as Activity[];

      // Aktivitäten den Leads zuordnen
      const leadsWithActivities = leads.map(lead => {
        const relatedActivities = activities.filter(activity => 
          activity.entity_type === 'lead' && activity.entity_id === lead.id
        );
        // Sortiere Aktivitäten nach Erstellungsdatum (neueste zuerst)
        relatedActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return {
          ...lead,
          activities: relatedActivities // Activities Feld zum Lead hinzufügen
        };
      });

      // Zustände aktualisieren
      setLeads(leadsWithActivities);

      // Weitere Fetches, die nicht direkt mit Leads/Aktivitäten verknüpft sind
      await Promise.all([
        fetchDeals(),
        fetchSavedFilters(),
        fetchCustomFields(),
        fetchActivityTemplates()
      ]);

    } catch (error) {
      console.error('An unexpected error occurred in fetchData:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while loading data",
        variant: "destructive",
      });
    } finally {
      console.log('fetchData: Finished data fetch.');
      setLoading(false);
      setIsFetching(false);
    }
  };

  const fetchDeals = async () => {
    if (!team) {
      console.log('fetchDeals: No team available, returning.');
      return;
    }

    console.log('fetchDeals: Starting deals fetch...');
    setLoading(true);
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('team_id', team.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(`Error fetching deals: ${error.message}`, error);
      return;
    }

    // Cast the data to proper Deal type
    setDeals((data || []) as Deal[]);
  };

  const fetchSavedFilters = async () => {
    if (!team) {
      console.log('fetchSavedFilters: No team available, returning.');
      return;
    }

    const { data, error } = await supabase
      .from('saved_filters')
      .select('*')
      .eq('team_id', team.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`Error fetching saved filters: ${error.message}`, error);
      return;
    }

    // Cast the data to proper SavedFilter type
    setSavedFilters((data || []) as SavedFilter[]);
  };

  const fetchCustomFields = async () => {
    if (!team) return;

    const { data, error } = await supabase
      .from('custom_fields')
      .select('*')
      .eq('team_id', team.id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error(`Error fetching custom fields: ${error.message}`, error);
      return;
    }

    // Cast the data to proper CustomField type
    setCustomFields((data || []) as CustomField[]);
  };

  const fetchActivityTemplates = async () => {
    if (!team) return;

    const { data, error } = await supabase
      .from('activity_templates')
      .select('*')
      .eq('team_id', team.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`Error fetching activity templates: ${error.message}`, error);
      return;
    }

    // Cast the data to proper ActivityTemplate type
    setActivityTemplates((data || []) as ActivityTemplate[]);
  };

  const addActivity = async (entityType: 'lead' | 'deal', entityId: string, activity: Omit<Activity, 'id' | 'team_id' | 'created_at'>) => {
    if (!team) return null;

    try {
      // Füge die Aktivität mit der übergebenen author_id hinzu
      const { data, error } = await supabase
        .from('activities')
        .insert({
          ...activity,
          team_id: team.id,
          entity_type: entityType,
          entity_id: entityId,
          ...(activity.type === 'custom' && { template_id: activity.template_id }),
          ...(activity.type === 'custom' && { template_data: activity.template_data }),
        })
        .select('*, template_id, template_data')
        .single();

      if (error) {
        console.error('Error adding activity:', error);
        toast({
          title: "Error",
          description: "Failed to add activity",
          variant: "destructive",
        });
        return null;
      }

      // Aktualisiere die lokalen Daten, wenn die Aktivität erfolgreich hinzugefügt wurde
      if (entityType === 'lead' && data) {
        const leadIndex = leads.findIndex(l => l.id === entityId);
        if (leadIndex !== -1) {
          const updatedLead = { ...leads[leadIndex] };
          // Sicherstellen, dass activities ein Array ist
          const currentActivities = Array.isArray(updatedLead.activities) ? updatedLead.activities : [];
          updatedLead.activities = [...currentActivities, data as Activity];
          // Sortiere Aktivitäten nach Erstellungsdatum (neueste zuerst) nach dem Hinzufügen
          updatedLead.activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setLeads(prev => prev.map(l => l.id === entityId ? updatedLead : l));

          if (selectedLead && selectedLead.id === entityId) {
            setSelectedLead(updatedLead);
          }
        }
      } else if (entityType === 'deal' && data) {
        const dealIndex = deals.findIndex(d => d.id === entityId);
        if (dealIndex !== -1) {
          const updatedDeal = { ...deals[dealIndex] };
          // Sicherstellen, dass activities ein Array ist
          const currentActivities = Array.isArray(updatedDeal.activities) ? updatedDeal.activities : [];
          updatedDeal.activities = [...currentActivities, data as Activity];
          // Sortiere Aktivitäten nach Erstellungsdatum (neueste zuerst) nach dem Hinzufügen
          updatedDeal.activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setDeals(prev => prev.map(d => d.id === entityId ? updatedDeal : d));

          if (selectedDeal && selectedDeal.id === entityId) {
            setSelectedDeal(updatedDeal);
          }
        }
      }

      toast({
        title: "Success",
        description: "Activity added successfully",
      });

      return data as Activity;
    } catch (error) {
      console.error('Error in addActivity:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
      return null;
    }
  };

  const deleteActivity = async (activityId: string, entityType: 'lead' | 'deal', entityId: string) => {
    if (!team) return;

    try {
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', activityId)
        .eq('team_id', team.id);

      if (error) {
        console.error('Error deleting activity:', error);
        toast({
          title: "Fehler",
          description: "Aktivität konnte nicht gelöscht werden",
          variant: "destructive",
        });
        return;
      }

      // Aktualisiere die lokalen Daten
      if (entityType === 'lead') {
        const leadIndex = leads.findIndex(l => l.id === entityId);
        if (leadIndex !== -1) {
          const updatedLead = { ...leads[leadIndex] };
          updatedLead.activities = updatedLead.activities?.filter(a => a.id !== activityId) || [];
          setLeads(prev => prev.map(l => l.id === entityId ? updatedLead : l));

          if (selectedLead && selectedLead.id === entityId) {
            setSelectedLead(updatedLead);
          }
        }
      } else if (entityType === 'deal') {
        const dealIndex = deals.findIndex(d => d.id === entityId);
        if (dealIndex !== -1) {
          const updatedDeal = { ...deals[dealIndex] };
          updatedDeal.activities = updatedDeal.activities?.filter(a => a.id !== activityId) || [];
          setDeals(prev => prev.map(d => d.id === entityId ? updatedDeal : d));

          if (selectedDeal && selectedDeal.id === entityId) {
            setSelectedDeal(updatedDeal);
          }
        }
      }

      toast({
        title: "Erfolg",
        description: "Aktivität wurde erfolgreich gelöscht",
      });
    } catch (error) {
      console.error('Error in deleteActivity:', error);
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten",
        variant: "destructive",
      });
    }
  };

  const createLead = async (newLead: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>) => {
    if (!team) return;

    try {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...newLead,
          team_id: team.id
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating lead:', error);
        toast({
          title: "Error",
          description: "Failed to create lead",
          variant: "destructive",
        });
        return null;
      }

      const newLeadData = data as Lead;
      setLeads(prev => [newLeadData, ...prev]);

      // Only show toast for manual lead creation, not during import
      toast({
        title: "Success",
        description: "Lead created successfully",
      });

      return newLeadData;
    } catch (error) {
      console.error('Error in createLead:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
      return null;
    }
  };

  const importLeads = async (leadsToImport: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>[]) => {
    if (!team) return;

    try {
      // Füge team_id zu jedem Lead hinzu
      const leadsWithTeamId = leadsToImport.map(lead => ({
        ...lead,
        team_id: team.id
      }));

      // Batch-Insert für alle Leads - silent import
      const { data, error } = await supabase
        .from('leads')
        .insert(leadsWithTeamId)
        .select();

      if (error) {
        console.error('Error importing leads:', error);
        throw new Error(`Failed to import leads: ${error.message}`);
      }

      const importedLeads = data as Lead[];

      // Update leads state silently - no toast notifications during import
      setLeads(prev => [...importedLeads, ...prev]);

      return importedLeads;
    } catch (error) {
      console.error('Error in importLeads:', error);
      throw error;
    }
  };

  const addCustomField = async (field: Omit<CustomField, 'id' | 'team_id' | 'created_at'>) => {
    if (!team) return;

    try {
      // Prüfe, ob das Feld bereits existiert
      const { data: existingFields, error: fetchError } = await supabase
        .from('custom_fields')
        .select('*')
        .eq('team_id', team.id)
        .eq('name', field.name)
        .eq('entity_type', field.entity_type);

      if (fetchError) {
        console.error('Error checking for existing custom field:', fetchError);
        throw fetchError;
      }

      // Wenn das Feld bereits existiert, nichts tun
      if (existingFields && existingFields.length > 0) {
        toast({
          title: "Warning",
          description: `A field named '${field.name}' already exists`,
          variant: "default",
        });
        return;
      }

      // Erstelle das neue benutzerdefinierte Feld
      const { data, error: insertError } = await supabase
        .from('custom_fields')
        .insert({
          ...field,
          team_id: team.id
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating custom field:', insertError);
        toast({
          title: "Error",
          description: "Failed to create custom field",
          variant: "destructive",
        });
        return;
      }

      // Aktualisiere den lokalen Zustand
      const newField = data as CustomField;
      setCustomFields(prev => [...prev, newField]);

      toast({
        title: "Success",
        description: `Custom field '${field.name}' created successfully`,
      });
    } catch (error) {
      console.error('Error in addCustomField:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const updateCustomField = async (id: string, updates: Partial<CustomField>) => {
    if (!team) return;

    try {
      const { data, error } = await supabase
        .from('custom_fields')
        .update(updates)
        .eq('id', id)
        .eq('team_id', team.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating custom field:', error);
        toast({
          title: "Error",
          description: "Failed to update custom field",
          variant: "destructive",
        });
        return;
      }

      // Aktualisiere den lokalen Zustand
      const updatedField = data as CustomField;
      setCustomFields(prev => prev.map(field => 
        field.id === id ? updatedField : field
      ));

      toast({
        title: "Success",
        description: "Custom field updated successfully",
      });
    } catch (error) {
      console.error('Error in updateCustomField:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const deleteCustomField = async (id: string) => {
    if (!team) return;

    try {
      const { error } = await supabase
        .from('custom_fields')
        .delete()
        .eq('id', id)
        .eq('team_id', team.id);

      if (error) {
        console.error('Error deleting custom field:', error);
        toast({
          title: "Error",
          description: "Failed to delete custom field",
          variant: "destructive",
        });
        return;
      }

      // Aktualisiere den lokalen Zustand
      setCustomFields(prev => prev.filter(field => field.id !== id));

      toast({
        title: "Success",
        description: "Custom field deleted successfully",
      });
    } catch (error) {
      console.error('Error in deleteCustomField:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const reorderCustomFields = async (fields: CustomField[]) => {
    if (!team) return;

    try {
      // Erstelle ein Array von Updates mit neuen sort_order-Werten
      const updates = fields.map((field, index) => ({
        id: field.id,
        sort_order: index
      }));

      // Führe alle Updates in einer Transaktion aus
      for (const update of updates) {
        const { error } = await supabase
          .from('custom_fields')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id)
          .eq('team_id', team.id);

        if (error) {
          console.error('Error reordering custom field:', error);
          throw error;
        }
      }

      // Aktualisiere den lokalen Zustand
      setCustomFields(fields);

      toast({
        title: "Success",
        description: "Custom fields reordered successfully",
      });
    } catch (error) {
      console.error('Error in reorderCustomFields:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const addActivityTemplate = async (template: Omit<ActivityTemplate, 'id' | 'team_id' | 'created_at'>) => {
    if (!team) return;

    try {
      const { data, error } = await supabase
        .from('activity_templates')
        .insert({
          ...template,
          team_id: team.id
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating activity template:', error);
        toast({
          title: "Error",
          description: "Failed to create activity template",
          variant: "destructive",
        });
        return;
      }

      // Aktualisiere den lokalen Zustand
      const newTemplate = data as ActivityTemplate;
      setActivityTemplates(prev => [...prev, newTemplate]);

      toast({
        title: "Success",
        description: `Activity template '${template.name}' created successfully`,
      });
    } catch (error) {
      console.error('Error in addActivityTemplate:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
      return null;
    }
  };

  const updateActivityTemplate = async (id: string, updates: Partial<ActivityTemplate>) => {
    if (!team) return;

    try {
      const { data, error } = await supabase
        .from('activity_templates')
        .update(updates)
        .eq('id', id)
        .eq('team_id', team.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating activity template:', error);
        toast({
          title: "Error",
          description: "Failed to update activity template",
          variant: "destructive",
        });
        return;
      }

      // Aktualisiere den lokalen Zustand
      const updatedTemplate = data as ActivityTemplate;
      setActivityTemplates(prev => prev.map(template => 
        template.id === id ? updatedTemplate : template
      ));

      toast({
        title: "Success",
        description: "Activity template updated successfully",
      });
    } catch (error) {
      console.error('Error in updateActivityTemplate:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const deleteActivityTemplate = async (id: string) => {
    if (!team) return;

    try {
      const { error } = await supabase
        .from('activity_templates')
        .delete()
        .eq('id', id)
        .eq('team_id', team.id);

      if (error) {
        console.error('Error deleting activity template:', error);
        toast({
          title: "Error",
          description: "Failed to delete activity template",
          variant: "destructive",
        });
        return;
      }

      // Aktualisiere den lokalen Zustand
      setActivityTemplates(prev => prev.filter(template => template.id !== id));

      toast({
        title: "Success",
        description: "Activity template deleted successfully",
      });
    } catch (error) {
      console.error('Error in deleteActivityTemplate:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const updateLead = async (leadId: string, updates: Partial<Lead>) => {
    if (!team) return;

    // 'activities' darf nicht in die Datenbank geschrieben werden
    const { activities, ...updatesWithoutActivities } = updates;

    const { data, error } = await supabase
      .from('leads')
      .update({ ...updatesWithoutActivities, updated_at: new Date().toISOString() })
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

    const updatedLead = data as Lead;
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...updatedLead, activities: lead.activities } : lead
    ));

    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({ ...updatedLead, activities: selectedLead.activities });
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

    const updatedDeal = data as Deal;
    setDeals(prev => prev.map(deal => 
      deal.id === dealId ? updatedDeal : deal
    ));

    if (selectedDeal && selectedDeal.id === dealId) {
      setSelectedDeal(updatedDeal);
    }

    toast({
      title: "Success",
      description: "Deal updated successfully",
    });
  };

  const convertLeadToDeal = async (lead: Lead) => {
    if (!team) return;

    try {
      // Erstelle eine Transaktion, um sicherzustellen, dass beide Operationen erfolgreich sind
      // 1. Erstelle einen neuen Deal aus dem Lead
      // 2. Aktualisiere den Lead-Status

      // Berechne den Initialwert des Deals basierend auf Lead-Daten
      const initialValue = lead.custom_fields?.estimated_value ? 
        parseFloat(lead.custom_fields.estimated_value as string) : 0;

      // Hole die aktuelle Benutzer-ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Kein Benutzer gefunden');
      }

      // Erstelle den Deal mit Daten aus dem Lead
      const { data: dealData, error: dealError } = await supabase
        .from('deals')
        .insert({
          team_id: team.id,
          name: lead.name,
          status: 'meeting_booked', // Setze den initialen Status auf 'Meeting Booked'
          value: initialValue,
          lead_id: lead.id,
          owner_id: user.id, // Verwende die ID des aktuellen Benutzers
          custom_fields: {
            ...lead.custom_fields,
            converted_from_lead: true,
            conversion_date: new Date().toISOString(),
            source: 'lead_conversion'
          },
          expected_close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 Tage in der Zukunft
        })
        .select()
        .single();

      if (dealError) {
        console.error('Error creating deal:', dealError);
        throw dealError;
      }

      // Kopiere Aktivitäten vom Lead zum Deal
      if (lead.activities && lead.activities.length > 0) {
        const activitiesToCopy = lead.activities.map(activity => ({
          team_id: team.id,
          entity_type: 'deal' as 'lead' | 'deal', // Setze entity_type auf 'deal'
          entity_id: dealData.id, // Setze entity_id auf die ID des neuen Deals
          type: activity.type,
          title: activity.title,
          content: activity.content,
          template_id: activity.template_id,
          template_data: activity.template_data,
          author_id: activity.author_id,
          created_at: activity.created_at // Behalte den ursprünglichen Erstellungszeitpunkt bei
        }));

        // Versuche, die Aktivitäten als Batch einzufügen
        const { error: activitiesError } = await supabase
          .from('activities')
          .insert(activitiesToCopy);

        if (activitiesError) {
          console.error('Error copying activities to deal:', activitiesError);
          // Gib eine Warnung aus, aber fahre mit der Konvertierung fort
          toast({
            title: "Warnung",
            description: "Einige Aktivitäten konnten nicht kopiert werden.",
            variant: "default",
          });
        }
      }

      // Aktualisiere den Lead-Status auf 'qualified' und füge einen Verweis auf den Deal hinzu
      const { error: leadError } = await supabase
        .from('leads')
        .update({ 
          status: 'qualified',
          custom_fields: {
            ...lead.custom_fields,
            converted_to_deal: true,
            deal_id: dealData.id,
            conversion_date: new Date().toISOString()
          }
        })
        .eq('id', lead.id)
        .eq('team_id', team.id);

      if (leadError) {
        console.error('Error updating lead after conversion:', leadError);
        throw leadError;
      }

      // Füge eine Aktivität hinzu, um die Konvertierung zu dokumentieren
      await addActivity('lead', lead.id, {
        type: 'note',
        content: `Lead wurde in Deal konvertiert: ${dealData.id}`,
        author_id: user.id, // Verwende die ID des aktuellen Benutzers
        entity_type: 'lead',
        entity_id: lead.id,
        template_data: {}
      });

      // Aktualisiere den lokalen Zustand für Deals und füge die kopierten Aktivitäten hinzu
      const newDeal = { ...dealData, activities: lead.activities || [] } as Deal;
      setDeals(prev => [newDeal, ...prev]);

      // Aktualisiere den Lead im lokalen Zustand
      const updatedLead: Lead = {
        ...lead,
        status: 'qualified' as const,
        custom_fields: {
          ...lead.custom_fields,
          converted_to_deal: true,
          deal_id: dealData.id,
          conversion_date: new Date().toISOString()
        }
      };
      setLeads(prev => prev.map(l => l.id === lead.id ? updatedLead : l));

      // Schließe den Lead-Detail-Bereich und öffne den Deal-Detail-Bereich
      setSelectedLead(null);
      setSelectedDeal(newDeal);
      setActiveSection('opportunities');

      toast({
        title: "Erfolg",
        description: `Lead "${lead.name}" wurde erfolgreich in einen Deal konvertiert`,
      });

      return newDeal;
    } catch (error) {
      console.error('Error converting lead to deal:', error);
      toast({
        title: "Fehler",
        description: "Konvertierung des Leads in einen Deal fehlgeschlagen",
        variant: "destructive",
      });
      return null;
    }
  };

  const importDeals = async (leadsToImport: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>[]) => {
    if (!team) return;
    try {
      const leadsWithTeamId = leadsToImport.map(lead => ({
        ...lead,
        team_id: team.id
      }));
      const { data, error } = await supabase
        .from('leads')
        .insert(leadsWithTeamId)
        .select();
      if (error) {
        console.error('Error importing leads:', error);
        toast({
          title: 'Error',
          description: 'Failed to import leads',
          variant: 'destructive',
        });
        return;
      }
      const importedLeads = data as Lead[];
      setLeads(prev => [...importedLeads, ...prev]);
      toast({
        title: 'Success',
        description: `${importedLeads.length} leads imported successfully`,
      });
    } catch (error) {
      console.error('Error in importLeads (via importDeals prop):', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred during lead import',
        variant: 'destructive',
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
            view={leadsView}
            onViewChange={setLeadsView}
            filters={currentFilters}
            onLeadSelect={setSelectedLead}
            onLeadUpdate={updateLead}
            onRefresh={fetchData}
            onCreateLead={createLead}
            onImportLeads={importLeads}
            onAddCustomField={addCustomField}
            customFields={customFields}
          />
        );
      case 'opportunities':
        return (
          <OpportunitiesView
            deals={deals}
            view={opportunitiesView}
            onViewChange={setOpportunitiesView}
            onDealSelect={setSelectedDeal}
            onDealUpdate={updateDeal}
            onRefresh={fetchDeals}
            onImportDeals={importDeals}
            onAddCustomField={addCustomField}
            customFields={customFields}
          />
        );
      case 'reports':
        return <ReportsView leads={leads} deals={deals} />;
      case 'settings':
        return (
          <SettingsView
            customFields={customFields}
            activityTemplates={activityTemplates}
            onAddCustomField={addCustomField}
            onUpdateCustomField={updateCustomField}
            onDeleteCustomField={deleteCustomField}
            onReorderCustomFields={reorderCustomFields}
            onAddActivityTemplate={addActivityTemplate}
            onUpdateActivityTemplate={updateActivityTemplate}
            onDeleteActivityTemplate={deleteActivityTemplate}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar 
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        savedFilters={savedFilters}
        currentFilters={currentFilters}
        onFilterSelect={(filters) => setCurrentFilters(filters)}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>

        <Dialog open={!!selectedDeal} onOpenChange={(open) => {!open && setSelectedDeal(null)}}>
          {selectedDeal && (
            <DealDetail
              deal={selectedDeal}
              onClose={() => setSelectedDeal(null)}
              onAddActivity={(activity) => addActivity('deal', selectedDeal.id, activity)}
              onUpdateDeal={updateDeal}
              allDeals={deals}
              onDealSelect={setSelectedDeal}
              onDeleteActivity={deleteActivity}
              linkedLead={selectedDeal.lead_id ? leads.find(lead => lead.id === selectedDeal.lead_id) : undefined}
              onLeadClick={(lead) => {
                setSelectedDeal(null);
                setSelectedLead(lead);
                setActiveSection('leads');
              }}
            />
          )}
        </Dialog>

        {selectedLead && (
          <LeadDetail
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onAddActivity={(activity) => addActivity('lead', selectedLead.id, activity)}
            onUpdateLead={updateLead}
            onConvertToDeal={() => convertLeadToDeal(selectedLead)}
            allLeads={leads}
            onLeadSelect={setSelectedLead}
            customFields={customFields}
            activityTemplates={activityTemplates}
            onDeleteActivity={deleteActivity}
            isOpen={!!selectedLead}
            onAddCustomField={addCustomField}
            onShowGlobalCustomFieldSettings={() => {
              setSelectedLead(null); // Close lead detail view
              setActiveSection('settings'); // Navigate to settings
            }}
          />
        )}
      </div>
      <ImportStatusBar />
    </div>
  );
};

export default CRMLayout;