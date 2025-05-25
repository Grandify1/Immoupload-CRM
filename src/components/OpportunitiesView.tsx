
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Eye, LayoutGrid, List, DollarSign } from 'lucide-react';
import { Deal } from '@/types/database';
import { cn } from '@/lib/utils';

interface OpportunitiesViewProps {
  deals: Deal[];
  view: 'table' | 'kanban';
  onViewChange: (view: 'table' | 'kanban') => void;
  filters: Record<string, any>;
  onDealSelect: (deal: Deal) => void;
  onDealUpdate: (dealId: string, updates: Partial<Deal>) => void;
  onRefresh: () => void;
}

const statusColors = {
  lead: 'bg-gray-500',
  qualified: 'bg-blue-500',
  proposal: 'bg-yellow-500',
  negotiation: 'bg-orange-500',
  won: 'bg-green-500',
  lost: 'bg-red-500'
};

const statusLabels = {
  lead: 'Lead',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost'
};

export const OpportunitiesView: React.FC<OpportunitiesViewProps> = ({
  deals,
  view,
  onViewChange,
  filters,
  onDealSelect,
  onDealUpdate,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewDealForm, setShowNewDealForm] = useState(false);
  const [newDeal, setNewDeal] = useState({
    name: '',
    value: 0,
    status: 'lead' as const
  });

  const filteredDeals = deals.filter(deal =>
    deal.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const handleCreateDeal = async () => {
    // This would normally create a deal via the parent component
    setNewDeal({ name: '', value: 0, status: 'lead' });
    setShowNewDealForm(false);
    onRefresh();
  };

  const TableView = () => (
    <div className="bg-white rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 font-medium text-gray-600">Name</th>
              <th className="text-left p-4 font-medium text-gray-600">Value</th>
              <th className="text-left p-4 font-medium text-gray-600">Status</th>
              <th className="text-left p-4 font-medium text-gray-600">Expected Close</th>
              <th className="text-left p-4 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDeals.map((deal) => (
              <tr key={deal.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-medium">{deal.name}</td>
                <td className="p-4 text-green-600 font-medium">
                  {formatCurrency(deal.value)}
                </td>
                <td className="p-4">
                  <Badge className={cn("text-white", statusColors[deal.status])}>
                    {statusLabels[deal.status]}
                  </Badge>
                </td>
                <td className="p-4 text-gray-600">
                  {deal.expected_close_date 
                    ? new Date(deal.expected_close_date).toLocaleDateString() 
                    : '-'
                  }
                </td>
                <td className="p-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDealSelect(deal)}
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
      { key: 'lead', label: 'Lead', deals: filteredDeals.filter(d => d.status === 'lead') },
      { key: 'qualified', label: 'Qualified', deals: filteredDeals.filter(d => d.status === 'qualified') },
      { key: 'proposal', label: 'Proposal', deals: filteredDeals.filter(d => d.status === 'proposal') },
      { key: 'negotiation', label: 'Negotiation', deals: filteredDeals.filter(d => d.status === 'negotiation') },
      { key: 'won', label: 'Won', deals: filteredDeals.filter(d => d.status === 'won') },
      { key: 'lost', label: 'Lost', deals: filteredDeals.filter(d => d.status === 'lost') }
    ];

    return (
      <div className="grid grid-cols-6 gap-4">
        {columns.map((column) => (
          <div key={column.key} className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium mb-4 flex items-center justify-between">
              {column.label}
              <span className="text-sm text-gray-500">({column.deals.length})</span>
            </h3>
            <div className="space-y-3">
              {column.deals.map((deal) => (
                <Card 
                  key={deal.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onDealSelect(deal)}
                >
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2">{deal.name}</h4>
                    <div className="flex items-center text-green-600 text-sm font-medium">
                      <DollarSign className="w-3 h-3 mr-1" />
                      {formatCurrency(deal.value)}
                    </div>
                    {deal.expected_close_date && (
                      <p className="text-xs text-gray-500 mt-2">
                        Close: {new Date(deal.expected_close_date).toLocaleDateString()}
                      </p>
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
        <h1 className="text-2xl font-bold">Opportunities</h1>
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
          <Button onClick={() => setShowNewDealForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Deal
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search deals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* New Deal Form */}
      {showNewDealForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Deal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <Input
                placeholder="Deal Name"
                value={newDeal.name}
                onChange={(e) => setNewDeal({...newDeal, name: e.target.value})}
              />
              <Input
                placeholder="Value"
                type="number"
                value={newDeal.value}
                onChange={(e) => setNewDeal({...newDeal, value: parseFloat(e.target.value) || 0})}
              />
              <div className="flex space-x-2">
                <Button onClick={handleCreateDeal} disabled={!newDeal.name}>
                  Create Deal
                </Button>
                <Button variant="outline" onClick={() => setShowNewDealForm(false)}>
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
