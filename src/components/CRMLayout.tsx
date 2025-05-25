
import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { LeadsView } from './LeadsView';
import { LeadDetail } from './LeadDetail';
import { cn } from '@/lib/utils';

export interface Lead {
  id: string;
  name: string;
  status: 'potential' | 'contacted' | 'qualified' | 'closed';
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  description?: string;
  owner?: string;
  activities: Activity[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Activity {
  id: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'task';
  content: string;
  author: string;
  createdAt: Date;
}

export interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, any>;
  isDefault?: boolean;
}

const CRMLayout = () => {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [currentFilters, setCurrentFilters] = useState<Record<string, any>>({});
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([
    { id: '1', name: 'Hot Leads', filters: { status: 'qualified' }, isDefault: true },
    { id: '2', name: 'Warm Leads', filters: { status: 'contacted' } },
    { id: '3', name: 'Cold Leads', filters: { status: 'potential' } },
    { id: '4', name: 'No Website', filters: { website: '' } },
  ]);

  const [leads, setLeads] = useState<Lead[]>([
    {
      id: '1',
      name: 'Immobilien Haunhorst GmbH',
      status: 'potential',
      email: 'info@haunhorst.de',
      phone: '+49 228 123456',
      website: 'https://www.mietwas.com',
      address: 'Meerhausener Str. 22, 53227 Bonn, Germany',
      description: 'Ihre Immobilienagentur in Bonn.',
      owner: 'dustin althaus',
      activities: [
        {
          id: '1',
          type: 'note',
          content: 'Bulk imported',
          author: 'dustin althaus',
          createdAt: new Date(Date.now() - 5 * 60 * 1000)
        }
      ],
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
      updatedAt: new Date(Date.now() - 5 * 60 * 1000)
    },
    {
      id: '2',
      name: 'Stephan & Raab Hausverwaltung + Immobilien',
      status: 'potential',
      email: 'info@stephan-raab.de',
      website: 'http://www.stephan-raab.de/',
      owner: 'dustin althaus',
      activities: [],
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
      updatedAt: new Date(Date.now() - 10 * 60 * 1000)
    },
    {
      id: '3',
      name: 'Schneider & Wegener Immobilienberatung',
      status: 'contacted',
      email: 'info@schneider-wegener.de',
      website: 'https://www.schneider-wegener.de',
      owner: 'dustin althaus',
      activities: [
        {
          id: '2',
          type: 'call',
          content: 'Initial contact made',
          author: 'dustin althaus',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        }
      ],
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
    }
  ]);

  const addActivity = (leadId: string, activity: Omit<Activity, 'id' | 'createdAt'>) => {
    setLeads(prev => prev.map(lead => {
      if (lead.id === leadId) {
        const newActivity: Activity = {
          ...activity,
          id: Math.random().toString(36).substr(2, 9),
          createdAt: new Date()
        };
        return {
          ...lead,
          activities: [newActivity, ...lead.activities],
          updatedAt: new Date()
        };
      }
      return lead;
    }));
  };

  const updateLead = (leadId: string, updates: Partial<Lead>) => {
    setLeads(prev => prev.map(lead => 
      lead.id === leadId 
        ? { ...lead, ...updates, updatedAt: new Date() }
        : lead
    ));
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        savedFilters={savedFilters}
        currentFilters={currentFilters}
        onFilterSelect={(filters) => setCurrentFilters(filters)}
      />
      
      <div className="flex-1 flex">
        <LeadsView
          leads={leads}
          view={view}
          onViewChange={setView}
          filters={currentFilters}
          onLeadSelect={setSelectedLead}
          onLeadUpdate={updateLead}
        />
        
        {selectedLead && (
          <LeadDetail
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onAddActivity={addActivity}
            onUpdateLead={updateLead}
            allLeads={leads}
            onLeadSelect={setSelectedLead}
          />
        )}
      </div>
    </div>
  );
};

export default CRMLayout;
