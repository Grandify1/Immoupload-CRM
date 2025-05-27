import React, { useState, useRef, useEffect } from 'react';
import { Lead, CustomField, ActivityTemplate, Activity } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Plus, Eye, LayoutGrid, List, Filter, Columns, Download, X, ArrowUpDown, DollarSign, Upload, AlertCircle, Check, Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import CSVImport from './CSVImport';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { LeadDetail } from './LeadDetail';

interface LeadsViewProps {
  leads: Lead[];
  view: 'table' | 'kanban';
  onViewChange: (view: 'table' | 'kanban') => void;
  filters: Record<string, any>;
  onLeadSelect: (lead: Lead | null) => void;
  onLeadUpdate: (leadId: string, updates: Partial<Lead>) => void;
  onRefresh: () => void;
  onCreateLead?: (lead: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>) => Promise<Lead | null>;
  onImportLeads?: (leads: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>[]) => Promise<void>;
  onAddCustomField?: (field: Omit<CustomField, 'id' | 'team_id' | 'created_at'>) => Promise<void>;
  customFields?: CustomField[];
  activityTemplates?: ActivityTemplate[];
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
  onRefresh,
  onCreateLead,
  onImportLeads,
  onAddCustomField,
  customFields,
  activityTemplates = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showCustomFieldForm, setShowCustomFieldForm] = useState(false);
  const [newLead, setNewLead] = useState<{
    name: string;
    email: string;
    phone: string;
    status: 'potential' | 'contacted' | 'qualified' | 'closed';
    custom_fields: Record<string, any>;
  }>({
    name: '',
    email: '',
    phone: '',
    status: 'potential',
    custom_fields: {}
  });
  
  const [newCustomField, setNewCustomField] = useState<{
    name: string;
    field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
    entity_type: 'lead' | 'deal';
    options: string[];
    sort_order: number;
  }>({
    name: '',
    field_type: 'text',
    entity_type: 'lead',
    options: [],
    sort_order: 0
  });
  
  // Smart Views und Filter-Status
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Array<{field: string, operator: string, value: string}>>([]);
  
  // Smart Views
  const [smartViews, setSmartViews] = useState<Array<{name: string, filters: Array<{field: string, operator: string, value: string}>}>>(() => {
    const savedViews = localStorage.getItem('smartViews');
    if (savedViews) {
      return JSON.parse(savedViews);
    }
    return [];
  });
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  
  // Erweiterte Filter-Funktionalität
  const [filterField, setFilterField] = useState<string>('name');
  const [filterOperator, setFilterOperator] = useState<string>('contains');
  const [filterValue, setFilterValue] = useState<string>('');
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>([]);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const { toast } = useToast();

  // Anwendung der Filter auf die Leads
  const filteredLeads = leads.filter(lead => {
    // Suche nach Suchbegriff
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;
    
    // Prüfe, ob alle aktiven Filter erfüllt sind
    return activeFilters.every(filter => {
      const { field, operator, value } = filter;
      
      // Website-Filter
      if (field === 'website') {
        if (operator === 'is_empty') {
          return !lead.website || lead.website.trim() === '';
        }
        if (operator === 'is_not_empty') {
          return lead.website && lead.website.trim() !== '';
        }
      }
      
      // Email-Filter
      if (field === 'email') {
        if (operator === 'is_empty') {
          return !lead.email || lead.email.trim() === '';
        }
        if (operator === 'is_not_empty') {
          return lead.email && lead.email.trim() !== '';
        }
      }
      
      // Status-Filter
      if (field === 'status' && operator === 'is_any_of') {
        const statusValues = value.split(',');
        return statusValues.includes(lead.status);
      }
      
      // Standardfilter für andere Felder
      const fieldValue = (lead as any)[field];
      if (fieldValue === undefined) return false;
      
      if (operator === 'contains') {
        return String(fieldValue).toLowerCase().includes(value.toLowerCase());
      }
      
      return true;
    });
  });

  const handleCreateLead = async () => {
    try {
      if (!onCreateLead) {
        console.error('onCreateLead function is not provided');
        return;
      }

      // Wir erstellen einen neuen Lead ohne ID, da Supabase automatisch eine UUID generiert
      const newLeadData = {
        name: newLead.name,
        email: newLead.email || null,
        phone: newLead.phone || null,
        status: newLead.status,
        custom_fields: {}
      };
      
      // Lead über die Elternkomponente erstellen
      await onCreateLead(newLeadData);
      
      // Formular zurücksetzen
      setNewLead({ name: '', email: '', phone: '', status: 'potential', custom_fields: {} });
      setShowNewLeadForm(false);
    } catch (error) {
      console.error('Error creating lead:', error);
    }
  };

  // Verfügbare Spalten für die Tabellenansicht
  const availableColumns = [
    { key: 'name', label: 'Name', visible: true },
    { key: 'email', label: 'Email', visible: true },
    { key: 'phone', label: 'Phone', visible: true },
    { key: 'website', label: 'Website', visible: false },
    { key: 'status', label: 'Status', visible: true },
    { key: 'owner', label: 'Owner', visible: false },
    { key: 'created_at', label: 'Created', visible: false },
    { key: 'updated_at', label: 'Updated', visible: false },
  ];

  // State für die sichtbaren Spalten
  // Laden der gespeicherten Spalteneinstellungen aus dem localStorage
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const savedColumns = localStorage.getItem('visibleColumns');
    if (savedColumns) {
      return JSON.parse(savedColumns);
    }
    return availableColumns.filter(col => col.visible);
  });


  // Funktion zum Umschalten der Spaltensichtbarkeit
  const toggleColumnVisibility = (columnKey: string) => {
    const columnExists = visibleColumns.some(col => col.key === columnKey);
    
    let newVisibleColumns;
    if (columnExists) {
      // Spalte entfernen, wenn sie bereits sichtbar ist
      newVisibleColumns = visibleColumns.filter(col => col.key !== columnKey);
    } else {
      // Spalte hinzufügen, wenn sie nicht sichtbar ist
      const columnToAdd = availableColumns.find(col => col.key === columnKey);
      if (columnToAdd) {
        newVisibleColumns = [...visibleColumns, columnToAdd];
      } else {
        return;
      }
    }
    
    // Aktualisiere den State
    setVisibleColumns(newVisibleColumns);
    
    // Speichere die Einstellung im localStorage
    localStorage.setItem('visibleColumns', JSON.stringify(newVisibleColumns));
  };

  // Funktion zum Hinzufügen eines Filters
  const addFilter = () => {
    if (filterField) {
      let operator = filterOperator;
      let value = filterValue;
      
      // Für Status-Filter
      if (filterField === 'status' && filterOperator === 'is_any_of') {
        value = selectedStatusFilters.join(',');
      }
      
      if ((filterField === 'website' || filterField === 'email') && 
          (filterOperator === 'is_empty' || filterOperator === 'is_not_empty')) {
        value = '';
      }
      
      setActiveFilters(prev => [...prev, { field: filterField, operator, value }]);
      setShowFilterMenu(false);
      
      // Zurücksetzen der Filter-Eingabefelder
      setFilterValue('');
      setSelectedStatusFilters([]);
    }
  };
  
  // Funktion zum Speichern einer Smart View
  const saveSmartView = () => {
    if (newViewName.trim() && activeFilters.length > 0) {
      const newSmartView = {
        name: newViewName.trim(),
        filters: [...activeFilters]
      };
      
      const updatedViews = [...smartViews, newSmartView];
      setSmartViews(updatedViews);
      localStorage.setItem('smartViews', JSON.stringify(updatedViews));
      
      setNewViewName('');
      setShowSaveViewDialog(false);
    }
  };
  
  // Funktion zum Laden einer Smart View
  const loadSmartView = (viewIndex: number) => {
    if (viewIndex >= 0 && viewIndex < smartViews.length) {
      setActiveFilters(smartViews[viewIndex].filters);
    }
  };
  
  // Funktion zum Löschen einer Smart View
  const deleteSmartView = (viewIndex: number) => {
    const updatedViews = smartViews.filter((_, index) => index !== viewIndex);
    setSmartViews(updatedViews);
    localStorage.setItem('smartViews', JSON.stringify(updatedViews));
  };

  // Funktion zum Entfernen eines Filters
  const removeFilter = (index: number) => {
    setActiveFilters(prev => prev.filter((_, i) => i !== index));
  };

  // Formatieren von Datum und Zeit
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const TableView = () => (
    <div className="bg-white rounded-lg border">
      {/* Toolbar */}
      <div className="p-2 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="flex items-center"
          >
            <Filter className="w-4 h-4 mr-2" />
            Add Filter
          </Button>

          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="flex items-center"
          >
            <Columns className="w-4 h-4 mr-2" />
            Columns
          </Button>
            
          {/* Smart Views Dropdown */}
          {smartViews.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center">
                  <Eye className="w-4 h-4 mr-2" />
                  Smart Views
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium mb-2">Saved Views</h4>
                  {smartViews.map((view, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <button
                        className="text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 w-full"
                        onClick={() => loadSmartView(index)}
                      >
                        {view.name}
                      </button>
                      <button
                        onClick={() => deleteSmartView(index)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Active Filters */}
      {activeFilters.length > 0 && (
        <div className="p-2 border-b border-gray-200 flex flex-wrap gap-2 items-center">
          {activeFilters.map((filter, index) => (
            <div key={index} className="flex items-center bg-gray-100 rounded-full px-3 py-1 text-sm">
              <span className="font-medium mr-1">{filter.field}:</span>
              <span>
                {filter.operator === 'is_empty' ? 'Is empty' : 
                 filter.operator === 'is_not_empty' ? 'Is not empty' : 
                 filter.operator === 'is_any_of' ? `Is any of [${filter.value}]` : 
                 filter.value}
              </span>
              <button 
                onClick={() => removeFilter(index)}
                className="ml-2 text-gray-500 hover:text-gray-700"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button 
            onClick={() => setActiveFilters([])} 
            className="text-blue-600 text-sm hover:underline"
          >
            Clear all
          </button>
          
          {/* Save as Smart View Button */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowSaveViewDialog(true)}
            className="ml-auto"
          >
            Save as Smart View
          </Button>
        </div>
      )}

      {/* Column Selector Dropdown */}
      {showColumnSelector && (
        <div className="absolute right-6 mt-2 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-10">
          <div className="p-2 border-b border-gray-200">
            <h3 className="font-medium">Show Columns</h3>
          </div>
          <div className="p-2 max-h-60 overflow-y-auto">
            {availableColumns.map(column => (
              <div key={column.key} className="flex items-center p-1">
                <input
                  type="checkbox"
                  id={`column-${column.key}`}
                  checked={visibleColumns.some(col => col.key === column.key)}
                  onChange={() => toggleColumnVisibility(column.key)}
                  className="mr-2"
                />
                <label htmlFor={`column-${column.key}`} className="text-sm">
                  {column.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Menu Dropdown */}
      {showFilterMenu && (
        <div className="absolute left-6 mt-2 w-80 bg-white border border-gray-200 rounded-md shadow-lg z-10">
          <div className="p-2 border-b border-gray-200">
            <h3 className="font-medium">Add Filter</h3>
          </div>
          <div className="p-4">
            <div className="mb-3">
              <label className="block text-sm mb-1 font-medium">Field</label>
              <select 
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                value={filterField}
                onChange={(e) => setFilterField(e.target.value)}
              >
                {availableColumns.map(column => (
                  <option key={column.key} value={column.key}>{column.label}</option>
                ))}
              </select>
            </div>
            
            <div className="mb-3">
              <label className="block text-sm mb-1 font-medium">Operator</label>
              <select 
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                value={filterOperator}
                onChange={(e) => setFilterOperator(e.target.value)}
              >
                {filterField === 'website' || filterField === 'email' ? (
                  <>
                    <option value="is_empty">Is empty</option>
                    <option value="is_not_empty">Is not empty</option>
                    <option value="contains">Contains</option>
                  </>
                ) : filterField === 'status' ? (
                  <>
                    <option value="is_any_of">Is any of</option>
                  </>
                ) : (
                  <option value="contains">Contains</option>
                )}
              </select>
            </div>
            
            {/* Wertfeld nur anzeigen, wenn der Operator es erfordert */}
            {(filterOperator === 'contains' || 
              (filterField !== 'website' && filterField !== 'email' && 
               filterOperator !== 'is_empty' && filterOperator !== 'is_not_empty')) && 
             filterField !== 'status' && (
              <div className="mb-3">
                <label className="block text-sm mb-1 font-medium">Value</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                />
              </div>
            )}
            
            {/* Status-Mehrfachauswahl */}
            {filterField === 'status' && filterOperator === 'is_any_of' && (
              <div className="mb-3">
                <label className="block text-sm mb-1 font-medium">Select Status</label>
                <div className="space-y-1 mt-1">
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <div key={value} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`status-${value}`}
                        checked={selectedStatusFilters.includes(value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStatusFilters(prev => [...prev, value]);
                          } else {
                            setSelectedStatusFilters(prev => prev.filter(s => s !== value));
                          }
                        }}
                        className="mr-2"
                      />
                      <label htmlFor={`status-${value}`} className="text-sm">{label}</label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex justify-end space-x-2 mt-4">
              <Button 
                variant="outline"
                size="sm" 
                onClick={() => setShowFilterMenu(false)}
              >
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={addFilter}
              >
                Apply Filter
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Save Smart View Dialog */}
      {showSaveViewDialog && (
        <div className="absolute right-6 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-10">
          <div className="p-2 border-b border-gray-200">
            <h3 className="font-medium">Save as Smart View</h3>
          </div>
          <div className="p-3">
            <div className="mb-3">
              <label className="block text-sm mb-1">View Name</label>
              <input 
                type="text" 
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="My Smart View"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline"
                size="sm" 
                onClick={() => setShowSaveViewDialog(false)}
              >
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={saveSmartView}
                disabled={!newViewName.trim() || activeFilters.length === 0}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {visibleColumns.map(column => (
                <th key={column.key} className="text-left p-3 font-medium text-gray-600">
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                    <button className="text-gray-400 hover:text-gray-600">
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="text-left p-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr 
                key={lead.id} 
                className="border-b hover:bg-gray-50 cursor-pointer" 
                onClick={() => onLeadSelect(lead)}
              >
                {visibleColumns.map(column => {
                  if (column.key === 'name') {
                    return <td key={column.key} className="p-3 font-medium">{lead.name}</td>;
                  } else if (column.key === 'email') {
                    return <td key={column.key} className="p-3 text-gray-600">{lead.email || '-'}</td>;
                  } else if (column.key === 'phone') {
                    return <td key={column.key} className="p-3 text-gray-600">{lead.phone || '-'}</td>;
                  } else if (column.key === 'website') {
                    return (
                      <td 
                        key={column.key} 
                        className="p-3 text-gray-600"
                        onClick={(e) => e.stopPropagation()} // Verhindert, dass der Klick auf den Link die Detailansicht öffnet
                      >
                        {lead.website ? (
                          <a 
                            href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {lead.website}
                          </a>
                        ) : '-'}
                      </td>
                    );
                  } else if (column.key === 'status') {
                    return (
                      <td key={column.key} className="p-3">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={cn("px-2 py-1 rounded-full text-xs font-medium text-white cursor-pointer", statusColors[lead.status])}>
                              {statusLabels[lead.status]}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2">
                            <div className="space-y-1">
                              <h4 className="text-sm font-medium mb-2">Status ändern</h4>
                              {Object.entries(statusLabels).map(([status, label]) => (
                                <button
                                  key={status}
                                  className={cn(
                                    "w-full text-left px-2 py-1.5 text-sm rounded flex items-center",
                                    lead.status === status ? "bg-gray-100" : "hover:bg-gray-50"
                                  )}
                                  onClick={() => {
                                    onLeadUpdate(lead.id, { status: status as any });
                                  }}
                                >
                                  <span className={cn(
                                    "w-2 h-2 rounded-full mr-2",
                                    statusColors[status as keyof typeof statusColors]
                                  )} />
                                  {label}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>
                    );
                  } else if (column.key === 'created_at') {
                    return <td key={column.key} className="p-3 text-gray-600">{formatDate(lead.created_at)}</td>;
                  } else if (column.key === 'updated_at') {
                    return <td key={column.key} className="p-3 text-gray-600">{formatDate(lead.updated_at)}</td>;
                  } else if (column.key === 'owner') {
                    return <td key={column.key} className="p-3 text-gray-600">{lead.owner_id || '-'}</td>;
                  }
                  return <td key={column.key} className="p-3">-</td>;
                })}
                <td className="p-3">
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation(); // Verhindert, dass der Klick auf den Button die Zeile auslöst
                        onLeadSelect(lead);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      <Mail className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Wenn kein Ziel oder das Ziel identisch mit der Quelle ist, nichts tun
    if (!destination || 
        (destination.droppableId === source.droppableId && 
         destination.index === source.index)) {
      return;
    }

    // ID des Leads, der verschoben wurde
    const leadId = draggableId;
    // Neue Status-Spalte
    const newStatus = destination.droppableId as 'potential' | 'contacted' | 'qualified' | 'closed';

    // Lead-Status aktualisieren
    const leadToUpdate = leads.find(lead => lead.id === leadId);
    if (leadToUpdate && leadToUpdate.status !== newStatus) {
      onLeadUpdate(leadId, { status: newStatus });
    }
  };

  const KanbanView = () => {
    const columns = [
      { key: 'potential', label: 'Potential', leads: filteredLeads.filter(l => l.status === 'potential') },
      { key: 'contacted', label: 'Contacted', leads: filteredLeads.filter(l => l.status === 'contacted') },
      { key: 'qualified', label: 'Qualified', leads: filteredLeads.filter(l => l.status === 'qualified') },
      { key: 'closed', label: 'Closed', leads: filteredLeads.filter(l => l.status === 'closed') }
    ];

    return (
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-4 gap-6">
          {columns.map((column) => (
            <div key={column.key} className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium mb-4 flex items-center justify-between">
                <span className={cn("px-2 py-1 rounded-full text-xs font-medium text-white", statusColors[column.key as keyof typeof statusColors])}>
                  {column.label}
                </span>
                <span className="text-sm text-gray-500">({column.leads.length})</span>
              </h3>
              <Droppable droppableId={column.key}>
                {(provided, snapshot) => (
                  <div 
                    className={cn(
                      "space-y-3 min-h-[200px]", 
                      snapshot.isDraggingOver ? "bg-blue-50" : ""
                    )}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {column.leads.map((lead, index) => (
                      <Draggable key={lead.id} draggableId={lead.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              ...provided.draggableProps.style,
                            }}
                          >
                            <Card 
                              className={cn(
                                "cursor-pointer hover:shadow-md transition-shadow",
                                snapshot.isDragging ? "shadow-lg" : ""
                              )}
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
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    );
  };

  const addActivity = async (entityType: 'lead' | 'deal', entityId: string, activity: Omit<Activity, 'id' | 'team_id' | 'created_at'>) => {
    // Implementierung der addActivity-Funktion
    // Diese Funktion sollte die Aktivität zur Datenbank hinzufügen
    // und den lokalen State aktualisieren
  };

  const convertLeadToDeal = async (lead: Lead) => {
    // Implementierung der convertLeadToDeal-Funktion
    // Diese Funktion sollte den Lead in einen Deal konvertieren
  };

  const deleteActivity = async (activityId: string, entityType: string, entityId: string) => {
    // Implementierung der deleteActivity-Funktion
    // Diese Funktion sollte die Aktivität aus der Datenbank löschen
    // und den lokalen State aktualisieren
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6">
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
            <div className="flex items-center space-x-2">
              <Button onClick={() => setShowNewLeadForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Lead
              </Button>
              <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
            </div>
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

        {/* New Lead Form Modal */}
        <Dialog open={showNewLeadForm} onOpenChange={setShowNewLeadForm}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Neuen Lead erstellen</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newLead.name}
                    onChange={(e) => setNewLead({...newLead, name: e.target.value})}
                    placeholder="Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newLead.email}
                    onChange={(e) => setNewLead({...newLead, email: e.target.value})}
                    placeholder="Email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({...newLead, phone: e.target.value})}
                    placeholder="Telefon"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={newLead.status}
                    onValueChange={(value: 'potential' | 'contacted' | 'qualified' | 'closed') => 
                      setNewLead({...newLead, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="potential">Potential</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Custom Fields Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Benutzerdefinierte Felder</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCustomFieldForm(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Feld hinzufügen
                  </Button>
                </div>
                
                {customFields && customFields.filter(field => field.entity_type === 'lead').map(field => {
                  const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={fieldKey}>{field.name}</Label>
                      {field.field_type === 'text' && (
                        <Input
                          id={fieldKey}
                          value={(newLead.custom_fields[fieldKey] as string) || ''}
                          onChange={(e) => {
                            const updatedCustomFields = { ...newLead.custom_fields, [fieldKey]: e.target.value };
                            setNewLead({ ...newLead, custom_fields: updatedCustomFields });
                          }}
                          placeholder={field.name}
                        />
                      )}
                      {field.field_type === 'number' && (
                        <Input
                          id={fieldKey}
                          type="number"
                          value={(newLead.custom_fields[fieldKey] as string) || ''}
                          onChange={(e) => {
                            const updatedCustomFields = { ...newLead.custom_fields, [fieldKey]: e.target.value };
                            setNewLead({ ...newLead, custom_fields: updatedCustomFields });
                          }}
                          placeholder={field.name}
                        />
                      )}
                      {field.field_type === 'select' && (
                        <Select
                          value={(newLead.custom_fields[fieldKey] as string) || ''}
                          onValueChange={(value) => {
                            const updatedCustomFields = { ...newLead.custom_fields, [fieldKey]: value };
                            setNewLead({ ...newLead, custom_fields: updatedCustomFields });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`${field.name} auswählen`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.map((option, index) => (
                              <SelectItem key={index} value={option}>{option}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewLeadForm(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleCreateLead} disabled={!newLead.name}>
                Lead erstellen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Custom Field Form Modal */}
        <Dialog open={showCustomFieldForm} onOpenChange={setShowCustomFieldForm}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Neues benutzerdefiniertes Feld</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="fieldName">Feldname</Label>
                <Input
                  id="fieldName"
                  value={newCustomField.name}
                  onChange={(e) => setNewCustomField({...newCustomField, name: e.target.value})}
                  placeholder="z.B. Budget"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fieldType">Feldtyp</Label>
                <Select
                  value={newCustomField.field_type}
                  onValueChange={(value: 'text' | 'number' | 'date' | 'select' | 'checkbox') => 
                    setNewCustomField({...newCustomField, field_type: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Typ auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Zahl</SelectItem>
                    <SelectItem value="date">Datum</SelectItem>
                    <SelectItem value="select">Auswahl</SelectItem>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newCustomField.field_type === 'select' && (
                <div className="space-y-2">
                  <Label>Optionen</Label>
                  <div className="space-y-2">
                    {newCustomField.options.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...newCustomField.options];
                            newOptions[index] = e.target.value;
                            setNewCustomField({...newCustomField, options: newOptions});
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newOptions = newCustomField.options.filter((_, i) => i !== index);
                            setNewCustomField({...newCustomField, options: newOptions});
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNewCustomField({
                        ...newCustomField,
                        options: [...newCustomField.options, '']
                      })}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Option hinzufügen
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowCustomFieldForm(false);
                setNewCustomField({
                  name: '',
                  field_type: 'text',
                  entity_type: 'lead',
                  options: [],
                  sort_order: 0
                });
              }}>
                Abbrechen
              </Button>
              <Button onClick={async () => {
                if (onAddCustomField) {
                  await onAddCustomField({
                    name: newCustomField.name,
                    field_type: newCustomField.field_type,
                    entity_type: newCustomField.entity_type,
                    options: newCustomField.options,
                    sort_order: newCustomField.sort_order
                  });
                  setShowCustomFieldForm(false);
                  setNewCustomField({
                    name: '',
                    field_type: 'text',
                    entity_type: 'lead',
                    options: [],
                    sort_order: 0
                  });
                }
              }} disabled={!newCustomField.name || (newCustomField.field_type === 'select' && newCustomField.options.length === 0)}>
                Feld erstellen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Content */}
        {view === 'table' ? <TableView /> : <KanbanView />}
      </div>

      {/* CSV Import Dialog */}
      {showImportDialog && onImportLeads && onAddCustomField && (
        <CSVImport
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          onImport={onImportLeads}
          onAddCustomField={async (name, type) => {
            // Erstelle ein CustomField Objekt basierend auf den von CSVImport gelieferten Daten
            const newField = {
              name: name,
              field_type: type as any, // Typ anpassen
              entity_type: 'lead', // Standardmäßig 'lead' für Leads
              options: type === 'select' ? [] : undefined, // Optionen nur für Select-Typ
              sort_order: 0, // Standard-Sortierreihenfolge
            } as Omit<CustomField, 'id' | 'team_id' | 'created_at'>;
            
            // Rufe die ursprüngliche onAddCustomField Prop auf
            return await onAddCustomField(newField);
          }}
          customFields={customFields}
          onRefresh={onRefresh}
        />
      )}

      {/* LeadDetail als Overlay */}
      <Dialog open={!!selectedLead} onOpenChange={(open) => {!open && setSelectedLead(null)}}>
        {selectedLead && (
          <LeadDetail
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onAddActivity={(activity) => addActivity('lead', selectedLead.id, activity)}
            onUpdateLead={onLeadUpdate}
            onConvertToDeal={() => convertLeadToDeal(selectedLead)}
            allLeads={leads}
            onLeadSelect={setSelectedLead}
            customFields={customFields}
            activityTemplates={activityTemplates}
            onDeleteActivity={deleteActivity}
            isOpen={!!selectedLead}
          />
        )}
      </Dialog>
    </div>
  );
};
