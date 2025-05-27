import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Lead, Deal } from '@/types/database';
import { TrendingUp, Users, DollarSign, Target } from 'lucide-react';

interface ReportsViewProps {
  leads: Lead[];
  deals: Deal[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({ leads, deals }) => {
  // Calculate metrics
  const totalLeads = leads.length;
  const totalDeals = deals.length;
  const totalValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
  const wonDeals = deals.filter(deal => deal.status === 'won').length;
  const conversionRate = totalLeads > 0 ? ((wonDeals / totalLeads) * 100).toFixed(1) : '0';

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  // Lead status distribution
  const leadStatusData = [
    { name: 'Potential', value: leads.filter(l => l.status === 'potential').length, color: '#6B7280' },
    { name: 'Contacted', value: leads.filter(l => l.status === 'contacted').length, color: '#3B82F6' },
    { name: 'Qualified', value: leads.filter(l => l.status === 'qualified').length, color: '#10B981' },
    { name: 'Closed', value: leads.filter(l => l.status === 'closed').length, color: '#EF4444' }
  ];

  // Deal status distribution
  const dealStatusData = [
    { name: 'Lead', value: deals.filter(d => d.status === 'lead').length, color: '#6B7280' },
    { name: 'Qualified', value: deals.filter(d => d.status === 'qualified').length, color: '#3B82F6' },
    { name: 'Proposal', value: deals.filter(d => d.status === 'proposal').length, color: '#F59E0B' },
    { name: 'Negotiation', value: deals.filter(d => d.status === 'negotiation').length, color: '#F97316' },
    { name: 'Won', value: deals.filter(d => d.status === 'won').length, color: '#10B981' },
    { name: 'Lost', value: deals.filter(d => d.status === 'lost').length, color: '#EF4444' }
  ];

  // Monthly data (simplified for demo)
  const monthlyData = [
    { month: 'Jan', leads: 12, deals: 3, revenue: 15000 },
    { month: 'Feb', leads: 19, deals: 5, revenue: 25000 },
    { month: 'Mar', leads: 15, deals: 4, revenue: 18000 },
    { month: 'Apr', leads: 22, deals: 7, revenue: 35000 },
    { month: 'May', leads: 18, deals: 6, revenue: 28000 },
    { month: 'Jun', leads: totalLeads, deals: totalDeals, revenue: totalValue }
  ];

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h1 className="text-2xl font-bold mb-6">Reports & Analytics</h1>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Leads</p>
                <p className="text-2xl font-bold">{totalLeads}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Target className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Deals</p>
                <p className="text-2xl font-bold">{totalDeals}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Value</p>
                <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
                <p className="text-2xl font-bold">{conversionRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Lead Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={leadStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({name, value}) => `${name}: ${value}`}
                >
                  {leadStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deal Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={dealStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({name, value}) => `${name}: ${value}`}
                >
                  {dealStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="leads" fill="#3B82F6" name="Leads" />
              <Bar dataKey="deals" fill="#10B981" name="Deals" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};