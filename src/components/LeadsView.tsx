
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Eye, LayoutGrid, List } from 'lucide-react';
import { Lead } from '@/types/database';
import { cn } from '@/lib/utils';

interface LeadsViewProps {
  leads: Lead[];
  view: 'table' | 'kanban';
  onViewChange: (view: 'table' | 'kanban') => void;
  filters: Record<string, any>;
  onLeadSelect: (lead: Lead) => void;
  onLeadUpdate: (leadId: string, updates: Partial<Lead>) => void;
  onRefresh: () => void;
}

const statusColors = {
  potential: 'bg-gray-500',
  contacted: 'bg-blue-500',
  qualified: 'bg-green-500',
  closed: 'bg-red-500'
};

const statusLabels = {
  potential: 'Potential',
  contacted: 'Contacted',
  qualified: 'Qualified',
  closed: 'Closed'
};

export const LeadsView: React.FC<LeadsViewProps> = ({
  leads,
  view,
  onViewChange,
  filters,
  onLeadSelect,
  onLeadUpdate,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'potential' as const
  });

  const filteredLeads = leads.filter(lead =>
    lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreateLead = async () => {
    // This would normally create a lead via the parent component
    // For now, we'll just reset the form
    setNewLead({ name: '', email: '', phone: '', status: 'potential' });
    setShowNewLeadForm(false);
    onRefresh();
  };

  const TableView = () => (
    <div className="bg-white rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 font-medium text-gray-600">Name</th>
              <th className="text-left p-4 font-medium text-gray-600">Email</th>
              <th className="text-left p-4 font-medium text-gray-600">Phone</th>
              <th className="text-left p-4 font-medium text-gray-600">Status</th>
              <th className="text-left p-4 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr key={lead.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-medium">{lead.name}</td>
                <td className="p-4 text-gray-600">{lead.email || '-'}</td>
                <td className="p-4 text-gray-600">{lead.phone || '-'}</td>
                <td className="p-4">
                  <Badge className={cn("text-white", statusColors[lead.status])}>
                    {statusLabels[lead.status]}
                  </Badge>
                </td>
                <td className="p-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onLeadSelect(lead)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const KanbanView = () => {
    const columns = [
      { key: 'potential', label: 'Potential', leads: filteredLeads.filter(l => l.status === 'potential') },
      { key: 'contacted', label: 'Contacted', leads: filteredLeads.filter(l => l.status === 'contacted') },
      { key: 'qualified', label: 'Qualified', leads: filteredLeads.filter(l => l.status === 'qualified') },
      { key: 'closed', label: 'Closed', leads: filteredLeads.filter(l => l.status === 'closed') }
    ];

    return (
      <div className="grid grid-cols-4 gap-6">
        {columns.map((column) => (
          <div key={column.key} className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium mb-4 flex items-center justify-between">
              {column.label}
              <span className="text-sm text-gray-500">({column.leads.length})</span>
            </h3>
            <div className="space-y-3">
              {column.leads.map((lead) => (
                <Card 
                  key={lead.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onLeadSelect(lead)}
                >
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2">{lead.name}</h4>
                    {lead.email && (
                      <p className="text-sm text-gray-600 mb-1">{lead.email}</p>
                    )}
                    {lead.phone && (
                      <p className="text-sm text-gray-600">{lead.phone}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Leads</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
            <Button
              variant={view === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewChange('table')}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={view === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewChange('kanban')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
          <Button onClick={() => setShowNewLeadForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Lead
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* New Lead Form */}
      {showNewLeadForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Lead</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Input
                placeholder="Name"
                value={newLead.name}
                onChange={(e) => setNewLead({...newLead, name: e.target.value})}
              />
              <Input
                placeholder="Email"
                type="email"
                value={newLead.email}
                onChange={(e) => setNewLead({...newLead, email: e.target.value})}
              />
              <Input
                placeholder="Phone"
                value={newLead.phone}
                onChange={(e) => setNewLead({...newLead, phone: e.target.value})}
              />
              <div className="flex space-x-2">
                <Button onClick={handleCreateLead} disabled={!newLead.name}>
                  Create Lead
                </Button>
                <Button variant="outline" onClick={() => setShowNewLeadForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {view === 'table' ? <TableView /> : <KanbanView />}
    </div>
  );
};
