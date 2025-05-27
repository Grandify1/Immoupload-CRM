
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Lead, Deal } from '@/types/database';
import { TrendingUp, Users, DollarSign, Target } from 'lucide-react';

interface ReportsViewProps {
  leads: Lead[];
  deals: Deal[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export const ReportsView: React.FC<ReportsViewProps> = ({ leads, deals }) => {
  const leadsByStatus = leads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const dealsByStatus = deals.reduce((acc, deal) => {
    acc[deal.status] = (acc[deal.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const leadChartData = Object.entries(leadsByStatus).map(([status, count]) => ({
    name: status,
    value: count
  }));

  const dealChartData = Object.entries(dealsByStatus).map(([status, count]) => ({
    name: status,
    value: count
  }));

  const totalLeads = leads.length;
  const totalDeals = deals.length;
  const totalDealValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
  const avgDealValue = totalDeals > 0 ? totalDealValue / totalDeals : 0;

  return (
    <div className="flex-1 p-6 h-full overflow-y-auto">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLeads}</div>
              <p className="text-xs text-muted-foreground">
                All time leads
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Deals</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDeals}</div>
              <p className="text-xs text-muted-foreground">
                Active opportunities
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat('de-DE', { 
                  style: 'currency', 
                  currency: 'EUR' 
                }).format(totalDealValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                Total deal value
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Deal Size</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat('de-DE', { 
                  style: 'currency', 
                  currency: 'EUR' 
                }).format(avgDealValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                Per deal average
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Leads by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={leadChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {leadChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deals by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dealChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {leads.slice(0, 5).map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{lead.name}</p>
                      <p className="text-sm text-gray-500">{lead.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{lead.status}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Deals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {deals
                  .sort((a, b) => (b.value || 0) - (a.value || 0))
                  .slice(0, 5)
                  .map((deal) => (
                    <div key={deal.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{deal.name}</p>
                        <p className="text-sm text-gray-500">{deal.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {new Intl.NumberFormat('de-DE', { 
                            style: 'currency', 
                            currency: 'EUR' 
                          }).format(deal.value || 0)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {deal.expected_close_date ? 
                            new Date(deal.expected_close_date).toLocaleDateString() : 
                            'No date set'
                          }
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
