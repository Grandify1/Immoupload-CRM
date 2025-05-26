import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Deal, CustomField, Lead } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Plus, Eye, LayoutGrid, List, Filter, Columns, Download, X, ArrowUpDown, DollarSign, Upload, AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import CSVImport from './CSVImport';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TableViewProps {
  deals: Deal[];
  visibleColumns: Array<{key: string; label: string; visible: boolean; type: string; options?: string[]}>;
  onDealSelect: (deal: Deal) => void;
  formatCurrency: (value: number | null | undefined) => string;
  formatDate: (dateString: string | null) => string;
  onDealUpdate: (dealId: string, updates: Partial<Deal>) => void;
  statusLabels: Record<string, string>;
  statusColors: Record<string, string>;
  allowedStatuses: string[];
}

interface KanbanViewProps {
  deals: Deal[];
  onDealSelect: (deal: Deal) => void;
  onDealUpdate: (dealId: string, updates: Partial<Deal>) => void;
  statusLabels: Record<string, string>;
  statusColors: Record<string, string>;
  allowedStatuses: string[];
}

interface OpportunitiesViewProps {
  deals: Deal[];
  view: 'table' | 'kanban';
  onViewChange: (view: 'table' | 'kanban') => void;
  onDealSelect: (deal: Deal) => void;
  onDealUpdate: (dealId: string, updates: Partial<Deal>) => void;
  onRefresh: () => void;
  onCreateDeal?: (deal: Omit<Deal, 'id' | 'team_id' | 'created_at' | 'updated_at'>) => Promise<Deal | null>;
  onImportDeals?: (leads: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>[]) => Promise<void>;
  onAddCustomField?: (name: string, type: string) => Promise<void>;
  customFields?: CustomField[];
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

// Füge die TableView-Komponente hinzu
const TableView: React.FC<TableViewProps> = ({
  deals,
  visibleColumns,
  onDealSelect,
  formatCurrency,
  formatDate,
  onDealUpdate,
  statusLabels,
  statusColors,
  allowedStatuses
}) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            {visibleColumns.map(column => (
              <th key={column.key} className="text-left p-3 font-medium text-gray-600">
                <div className="flex items-center space-x-1">
                  <span>{column.label}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr
              key={deal.id}
              className="border-b hover:bg-gray-50 cursor-pointer"
              onClick={() => onDealSelect(deal)}
            >
              {visibleColumns.map(column => (
                <td key={column.key} className="p-3 text-sm text-gray-800">
                  {column.key === 'value' ? (
                    formatCurrency(deal.value)
                  ) : column.key === 'status' ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <div>
                          <Badge className={cn("text-white cursor-pointer", {
                            'bg-gray-500': deal.status === 'new',
                            'bg-blue-500': deal.status === 'lead',
                            'bg-purple-500': deal.status === 'qualified',
                            'bg-yellow-500': deal.status === 'proposal',
                            'bg-orange-500': deal.status === 'negotiating',
                            'bg-green-500': deal.status === 'won',
                            'bg-red-500': deal.status === 'lost',
                            'bg-gray-400': deal.status === 'closed',
                            'bg-indigo-500': deal.status === 'appointment_no_show',
                            'bg-teal-500': deal.status === 'meeting_booked',
                            'bg-pink-500': deal.status === 'internal_drafting_sow',
                            'bg-brown-500': deal.status === 'sow_sent',
                          }[deal.status] || 'bg-gray-500')}>
                            {deal.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </Badge>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-0">
                        <Select
                          value={deal.status}
                          onValueChange={(newStatus: string) => {
                            onDealUpdate(deal.id, { status: newStatus });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Status ändern" />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedStatuses.map(statusKey => (
                              <SelectItem key={statusKey} value={statusKey}>
                                {statusLabels[statusKey] || statusKey}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </PopoverContent>
                    </Popover>
                  ) : column.key === 'expected_close_date' ? (
                    formatDate(deal.expected_close_date)
                  ) : column.key === 'created_at' ? (
                    formatDate(deal.created_at)
                  ) : column.key === 'updated_at' ? (
                    formatDate(deal.updated_at)
                  ) : column.key === 'owner_id' ? (
                    deal.owner_id || 'Unassigned'
                  ) : column.type === 'checkbox' ? (
                    deal.custom_fields?.[column.key] ? 'Yes' : 'No'
                  ) : (column.type === 'select' || column.type === 'text') && column.options ? (
                    (String(deal.custom_fields?.[column.key] || '')).split(',').filter(item => item.trim() !== '').map((item, index) => (
                      <Badge key={index} variant="secondary" className="mr-1 mb-1">{item.trim()}</Badge>
                    ))
                  ) : (
                    (deal.custom_fields?.[column.key] as string) || '-'
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Füge die KanbanView-Komponente hinzu
const KanbanView: React.FC<KanbanViewProps> = ({
  deals,
  onDealSelect,
  onDealUpdate,
  statusLabels,
  statusColors,
  allowedStatuses
}) => {
  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const dealId = draggableId;
    const newStatus = destination.droppableId;

    onDealUpdate(dealId, { status: newStatus });
  };

  // Die Spalten basierend auf den im OpportunitiesView geladenen Stati erstellen
  const columns = allowedStatuses.map(statusKey => ({
    id: statusKey,
    title: statusLabels[statusKey] || statusKey, // Fallback zu statusKey falls Label fehlt
    deals: deals.filter(deal => deal.status === statusKey)
  }));

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 h-full">
        {columns.map(column => (
          <div key={column.id} className="flex-1 min-w-[300px]">
            <div className="bg-gray-50 p-2 rounded-t-lg">
              <h3 className="font-medium">{column.title} ({column.deals.length})</h3>
            </div>
            <Droppable droppableId={column.id}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="bg-gray-100 p-2 rounded-b-lg min-h-[50px] overflow-y-auto"
                >
                  {column.deals.map((deal, index) => (
                    <Draggable key={deal.id} draggableId={deal.id} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="bg-white p-3 rounded-lg shadow-sm mb-2 cursor-pointer"
                          onClick={() => onDealSelect(deal)}
                        >
                          <div className="font-medium">{deal.name}</div>
                          <div className="text-sm text-gray-500">
                            {formatCurrency(deal.value)}
                          </div>
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

export const OpportunitiesView = ({
  deals,
  view,
  onViewChange,
  onDealSelect,
  onDealUpdate,
  onRefresh,
  onCreateDeal,
  onImportDeals,
  onAddCustomField,
  customFields
}: OpportunitiesViewProps): JSX.Element => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewDealForm, setShowNewDealForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [filterField, setFilterField] = useState<string>('');
  const [filterOperator, setFilterOperator] = useState<string>('contains');
  const [filterValue, setFilterValue] = useState<any>('');
  const [selectedMultiSelectValues, setSelectedMultiSelectValues] = useState<string[]>([]);
  const [newViewName, setNewViewName] = useState('');
  const [activeFilters, setActiveFilters] = useState<Array<{field: string; operator: string; value: any;}>>([]);
  const [allowedStatuses, setAllowedStatuses] = useState<string[]>([]);
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({});
  const [statusColors, setStatusColors] = useState<Record<string, string>>({});
  const [smartViews, setSmartViews] = useState<Array<{name: string, filters: Array<{field: string; operator: string; value: any;}>}>>(() => {
    const savedViews = localStorage.getItem('dealSmartViews');
    if (savedViews) {
      try {
        return JSON.parse(savedViews);
      } catch (error) {
        console.error('Error parsing saved deal smart views:', error);
        return [];
      }
    }
    return [];
  });
  const [newDeal, setNewDeal] = useState<Omit<Deal, 'id' | 'team_id' | 'created_at' | 'updated_at'> & { custom_fields?: Record<string, any> }>({
    name: '',
    value: 0,
    status: 'new',
    expected_close_date: new Date().toISOString().split('T')[0],
    custom_fields: {}
  });
  const { toast } = useToast();

  // Funktion zum Laden der erlaubten Stati aus der allowed_deal_statuses Tabelle
  const loadAllowedStatuses = async () => {
    console.log('loadAllowedStatuses: Start'); // Debug-Log
    try {
      const { data, error } = await supabase
        .from('allowed_deal_statuses')
        .select('status')
        .order('status');

      if (error) {
        console.error('loadAllowedStatuses: Supabase Fehler:', error); // Debug-Log
        throw error;
      }

      if (!data) {
        console.log('loadAllowedStatuses: Keine Stati gefunden'); // Debug-Log
        setAllowedStatuses([]);
        setStatusLabels({});
        setStatusColors({});
        return;
      }

      const statuses = data.map(row => row.status);
      console.log('loadAllowedStatuses: Geladene Stati:', statuses); // Debug-Log
      setAllowedStatuses(statuses);

      // Dynamische Erstellung von Labels und Farben (Beispiel)
      const labels: Record<string, string> = {};
      const colors: Record<string, string> = {};
      statuses.forEach(status => {
        labels[status] = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        // Einfache Farbzuordnung (kann nach Bedarf angepasst werden)
        if (status === 'new') colors[status] = 'bg-gray-500';
        else if (status === 'lead') colors[status] = 'bg-blue-500';
        else if (status === 'qualified') colors[status] = 'bg-purple-500';
        else if (status === 'proposal') colors[status] = 'bg-yellow-500';
        else if (status === 'negotiating') colors[status] = 'bg-orange-500';
        else if (status === 'won') colors[status] = 'bg-green-500';
        else if (status === 'lost') colors[status] = 'bg-red-500';
        else colors[status] = 'bg-gray-500'; // Standardfarbe
      });
      setStatusLabels(labels);
      setStatusColors(colors);

    } catch (error) {
      console.error('loadAllowedStatuses: Fehler beim Laden der Stati:', error); // Debug-Log
      toast({
        title: 'Fehler',
        description: 'Die erlaubten Stati konnten nicht geladen werden.',
        variant: 'destructive',
      });
    }
  };

  // Stati laden beim ersten Rendern und wenn Deals sich ändern (um Spalten anzupassen)
  useEffect(() => {
    loadAllowedStatuses();
  }, [deals]); // Abhängigkeit von Deals, damit bei Änderungen neu geladen wird (kann angepasst werden)

  // Define available columns for deals, including custom fields
  const availableColumns = useMemo(() => [
    { key: 'name', label: 'Name', visible: true, type: 'text' },
    { key: 'value', label: 'Value', visible: true, type: 'number' },
    { key: 'status', label: 'Status', visible: true, type: 'select', options: allowedStatuses },
    { key: 'expected_close_date', label: 'Expected Close', visible: true, type: 'date' },
    { key: 'owner_id', label: 'Owner', visible: false, type: 'text' },
    { key: 'updated_at', label: 'Updated', visible: false, type: 'date' },
    { key: 'created_at', label: 'Created', visible: false, type: 'date' },
    ...(customFields || []).filter(cf => cf.entity_type === 'deal').map(cf => ({
      key: cf.name.toLowerCase().replace(/\s+/g, '_'),
      label: cf.name,
      visible: false,
      type: cf.field_type,
      options: cf.options
    }))
  ], [customFields, allowedStatuses]);

  // Initialize filterField with the first available column key and reset filter value when field changes
  useEffect(() => {
    if (availableColumns.length > 0 && !filterField) {
      setFilterField(availableColumns[0].key);
    }
  }, [availableColumns, filterField]);

  useEffect(() => {
    // Reset value and operator when the filter field changes
    setFilterOperator('contains'); // Default operator
    setFilterValue('');
    setSelectedMultiSelectValues([]); // Reset multi-select values
  }, [filterField]);

  // State for visible columns
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const savedColumns = localStorage.getItem('opportunitiesVisibleColumns');
    if (savedColumns) {
      try {
        const parsedColumns = JSON.parse(savedColumns);
        // Filter out any saved columns that are no longer in availableColumns and add type/options
        return parsedColumns.map((savedCol: any) => {
          const correspondingCol = availableColumns.find(col => col.key === savedCol.key);
          // Merge saved visibility with current definition, ensure type and options are carried over
          return correspondingCol ? { ...correspondingCol, visible: savedCol.visible } : null;
        }).filter((col: any): col is { key: string; label: string; visible: boolean; type: string; options?: string[]; } => col !== null);
      } catch (error) {
        console.error('Error parsing saved columns from localStorage:', error);
        return availableColumns.filter(col => col.visible); // Fallback to default visible
      }
    }
    return availableColumns.filter(col => col.visible); // Default visible columns
  });

  // Save visible columns (only key and visibility) to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('opportunitiesVisibleColumns', JSON.stringify(visibleColumns.map(({ key, visible }) => ({ key, visible }))));
  }, [visibleColumns]);

  // Update visibleColumns when availableColumns (due to customFields change) changes
  useEffect(() => {
    setVisibleColumns(prev => {
      const newVisible = prev.map(prevCol => {
        const currentDef = availableColumns.find(col => col.key === prevCol.key);
        // Carry over visibility, but update definition from availableColumns
        return currentDef ? { ...currentDef, visible: prevCol.visible } : null;
      }).filter((col: any): col is { key: string; label: string; visible: boolean; type: string; options?: string[]; } => col !== null);

      // Add newly available columns as hidden by default, maintaining order
      const finalVisible = availableColumns.map(availableCol => {
        const existing = newVisible.find(visibleCol => visibleCol.key === availableCol.key);
        // If exists, use its visibility, otherwise add as hidden
        return existing || { ...availableCol, visible: false };
      });
      return finalVisible;
    });
  }, [availableColumns]);

  // Funktion zum Umschalten der Spaltensichtbarkeit
  const toggleColumnVisibility = (columnKey: string) => {
    setVisibleColumns(prev => {
      const columnExists = prev.some(col => col.key === columnKey);
      const columnToAdd = availableColumns.find(col => col.key === columnKey);
      if (!columnToAdd) return prev; // Should not happen if key comes from availableColumns

      let newVisibleColumns;
      if (columnExists) {
        // Find the column to update visibility
        newVisibleColumns = prev.map(col =>
          col.key === columnKey ? { ...col, visible: false } : col
        );
      } else {
        // Add the column as visible and maintain order based on availableColumns
        const columnWithVisibility = { ...columnToAdd, visible: true };
        // Filter out the old definition if it existed (as hidden) and add the new one
        const filteredPrev = prev.filter(col => col.key !== columnKey);
        newVisibleColumns = [...filteredPrev, columnWithVisibility];

        // Re-sort based on availableColumns order
        newVisibleColumns.sort((a, b) => availableColumns.findIndex(col => col.key === a.key) - availableColumns.findIndex(col => col.key === b.key));
      }

      // Save the updated visible columns state
      localStorage.setItem('opportunitiesVisibleColumns', JSON.stringify(newVisibleColumns.map(({ key, visible }) => ({ key, visible }))));

      return newVisibleColumns;
    });
  };

  // Funktion zum Hinzufügen eines Filters
  const addFilter = () => {
    const selectedCol = availableColumns.find(col => col.key === filterField);
    if (!selectedCol) return;

    let filterValueToAdd: any = filterValue;

    // Handle multi-select values (Status, Text with options, Select)
    if ((selectedCol.type === 'select' || (selectedCol.type === 'text' && selectedCol.options) || filterField === 'status') && filterOperator === 'is_any_of') {
      filterValueToAdd = selectedMultiSelectValues.join(',');
      if (selectedMultiSelectValues.length === 0) {
        console.warn('Multi-select filter requires at least one selection:', filterField);
        // Optionally show user feedback
        return;
      }
    } else if (selectedCol.type === 'number') {
      const parsedValue = parseFloat(filterValue);
      if (isNaN(parsedValue) && (filterOperator !== 'is_empty' && filterOperator !== 'is_not_empty')) {
        console.warn('Invalid number filter value:', filterField, filterOperator, filterValue);
        // Optionally show user feedback
        return;
      }
      filterValueToAdd = parsedValue; // Store as number
    } else if (selectedCol.type === 'checkbox') {
      // Checkbox filter value comes from the specific UI, not filterValue string
      // The UI should set filterValue to 'true' or 'false'
      if (filterValue === '') {
        console.warn('Checkbox filter value is required.');
        return;
      }
      filterValueToAdd = filterValue === 'true'; // Store boolean
    } else if (selectedCol.type === 'date') {
      if (filterValue === '' && (filterOperator !== 'is_empty' && filterOperator !== 'is_not_empty')) {
        console.warn('Date filter value is required.', filterField, filterOperator, filterValue);
        return;
      }
      filterValueToAdd = filterValue; // Store date as string
    } else { // Text fields (default)
      if (filterValue === '') {
        console.warn('Text filter value is required.', filterField, filterOperator, filterValue);
        return;
      }
    }

    // Prevent adding filter if value is required but empty (except for is_empty/is_not_empty)
    const isValueRequired = filterOperator !== 'is_empty' && filterOperator !== 'is_not_empty';
    const isValueEmpty = filterValue === '';
    const isMultiSelectLike = selectedCol.type === 'select' || (selectedCol.type === 'text' && selectedCol.options) || filterField === 'status';
    const isCheckbox = selectedCol.type === 'checkbox';

    // Check if value is required and is either empty string or empty array (for multi-select)
    if (isValueRequired && (isValueEmpty || (isMultiSelectLike && selectedMultiSelectValues.length === 0))) {
      console.warn('Filter value is required:', filterField, filterOperator, isMultiSelectLike ? selectedMultiSelectValues : filterValue);
      return;
    }
    // Checkbox requires a 'true' or 'false' string value from UI if value is required
    if (isValueRequired && isCheckbox && filterValue === '') {
      console.warn('Filter value is required for checkbox:', filterField, filterOperator, filterValue);
      return;
    }

    setActiveFilters(prev => [
      ...prev,
      { field: filterField, operator: filterOperator, value: filterValueToAdd }
    ]);

    // Reset filter menu state
    // setFilterField(availableColumns[0]?.key || ''); // Keep current field selected for adding multiple filters on same field
    setFilterOperator('contains');
    setFilterValue('');
    setSelectedMultiSelectValues([]); // Reset multi-select values
    setShowFilterMenu(false);
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
      localStorage.setItem('dealSmartViews', JSON.stringify(updatedViews));

      setNewViewName('');
      setShowSaveViewDialog(false);
    }
  };

  const loadSmartView = (viewFilters: Array<{field: string; operator: string; value: any;}>) => {
    setActiveFilters(viewFilters);
    setShowFilterMenu(false);
  };

  const deleteSmartView = (viewName: string) => {
    const updatedViews = smartViews.filter(view => view.name !== viewName);
    setSmartViews(updatedViews);
    localStorage.setItem('dealSmartViews', JSON.stringify(updatedViews));
  };

  const removeFilter = (index: number) => {
    setActiveFilters(prev => prev.filter((_, i) => i !== index));
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return '-';
      }
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return '-';
    }
  };

  // Filter logic based on activeFilters and searchTerm
  const filteredDeals = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return deals.filter(deal => {
      // Basic search across name and value
      const matchesSearch = deal.name.toLowerCase().includes(lowerCaseSearchTerm) ||
                            (deal.value !== null && deal.value !== undefined && String(deal.value).includes(searchTerm));

      if (!matchesSearch) return false; // Deal must match search term

      // Apply active filters
      return activeFilters.every(filter => {
        const { field, operator, value } = filter;
        const selectedCol = availableColumns.find(col => col.key === field);
        if (!selectedCol) return true; // If column not found (shouldn't happen), don't filter it

        // Access value from either standard fields or custom_fields
        // Use optional chaining and nullish coalescing for safety
        const fieldKey = selectedCol.key;

        const fieldValue = (deal as any)?.[fieldKey] !== undefined && (deal as any)?.[fieldKey] !== null
                            ? (deal as any)?.[fieldKey]
                            : deal.custom_fields?.[fieldKey];

        const fieldType = selectedCol.type;

        // Handle empty/not empty for all types
        if (operator === 'is_empty') return fieldValue === undefined || fieldValue === null || String(fieldValue || '').trim() === '';
        if (operator === 'is_not_empty') return fieldValue !== undefined && fieldValue !== null && String(fieldValue || '').trim() !== '';

        // Handle other operators based on field type
        if (fieldType === 'text') {
          const lowerCaseFieldValue = String(fieldValue || '').toLowerCase();

          if (operator === 'contains') {
             const lowerCaseValue = String(value || '').toLowerCase();
             return lowerCaseFieldValue.includes(lowerCaseValue);
          } else if (operator === 'equals') {
             const lowerCaseValue = String(value || '').toLowerCase();
             return lowerCaseFieldValue === lowerCaseValue;
          } else if (operator === 'is_any_of') { // For text multi-select (value is comma-separated string)
             const selectValues = (Array.isArray(value) ? value : String(value).split(',')).filter(s => s).map(s => s.toLowerCase());
             if (selectValues.length === 0) return true; // If no options selected, consider it a match (or false depending on desired logic)
             // Check if the text field value is included in the selected values (case-insensitive)
             return selectValues.includes(lowerCaseFieldValue);
          }
        } else if (fieldType === 'number') {
          const numericFieldValue = parseFloat(fieldValue);
          const numericValue = parseFloat(value);

           // Handle cases where fieldValue or value are not valid numbers
           // If operator requires numeric comparison, both must be valid numbers
           if ((operator === 'equals' || operator === 'greater_than' || operator === 'less_than') && (isNaN(numericFieldValue) || isNaN(numericValue))) return false;

           if (operator === 'equals') return numericFieldValue === numericValue;
           if (operator === 'greater_than') return numericFieldValue > numericValue;
           if (operator === 'less_than') return numericFieldValue < numericValue;

           // is_empty/is_not_empty already handled
           return true; // Fallback, should not be reached with proper operators
        } else if (fieldType === 'date') {
           // Ensure fieldValue is treated as a date string and parse to date objects
           const dateFieldValue = fieldValue ? new Date(String(fieldValue)) : null;
           const dateValue = value ? new Date(String(value)) : null;

           // Cannot compare if dates are invalid or missing, unless operator is is_empty/is_not_empty handled above
           if ((operator === 'equals' || operator === 'before' || operator === 'after') && (!dateFieldValue || isNaN(dateFieldValue.getTime()) || !dateValue || isNaN(dateValue.getTime()))) return false;

           // Compare dates without time component for 'equals', 'before', 'after'
           const dateFieldValueMidnight = dateFieldValue ? dateFieldValue.setHours(0,0,0,0) : null;
           const dateValueMidnight = dateValue ? dateValue.setHours(0,0,0,0) : null;

           if (operator === 'equals') return dateFieldValueMidnight === dateValueMidnight;
           if (operator === 'before') return dateFieldValueMidnight !== null && dateValueMidnight !== null && dateFieldValueMidnight < dateValueMidnight;
           if (operator === 'after') return dateFieldValueMidnight !== null && dateValueMidnight !== null && dateFieldValueMidnight > dateValueMidnight;

           // is_empty/is_not_empty already handled
           return true; // Fallback
        } else if (fieldType === 'select' || fieldKey === 'status') { // Handle select type and the special 'status' field
           if (operator === 'is_any_of') {
              const selectValues = (Array.isArray(value) ? value : String(value).split(',')).filter(s => s) as string[]; // Cast value to string[]
              if (selectValues.length === 0) return true; // If no options selected, consider it a match
              // Check if the deal's select/status field value is included in the selected values (case-sensitive for select options/status keys)
              return selectValues.includes(fieldValue);
           } else if (operator === 'equals') { // Single select equals
               return fieldValue === value;
           }
            // is_empty/is_not_empty already handled
           return true; // Fallback
        }

        // Fallback for unhandled field types/operators - consider it a match
        console.warn('Unhandled filter combination:', fieldKey, fieldType, operator, value);
        return true;
      });
    });
  }, [deals, searchTerm, activeFilters, availableColumns]);

  const handleCreateDeal = async () => {
    if (!onCreateDeal) {
      console.error('onCreateDeal function is not provided');
      // Optionally show user feedback
      return;
    }

    try {
      // Ensure custom_fields is an object, even if empty
      const dealToCreate = {
        ...newDeal,
        custom_fields: newDeal.custom_fields || {}
      };

      // Create deal via the parent component
      const createdDeal = await onCreateDeal(dealToCreate);

      if (createdDeal) {
        // Reset form
        setNewDeal({ name: '', value: 0, status: 'new', expected_close_date: new Date().toISOString().split('T')[0], custom_fields: {} });
        setShowNewDealForm(false);
        // onRefresh will be called by the parent component after successful creation
      } else {
          // Handle case where creation failed (e.g., validation errors returned by parent)
          console.warn('Deal creation failed.');
          // Optionally show a user-friendly message
      }
    } catch (error) {
      console.error('Error creating deal:', error);
      // Error handling is likely done in the parent component
    }
  };

  // Aktualisiere die Select-Komponente für den Status
  const handleStatusChange = (value: string) => {
    setFilterValue(value);
  };

  // Aktualisiere die Multi-Select-Komponente
  const handleMultiSelectChange = (value: string) => {
    setSelectedMultiSelectValues([value]);
  };

  return (
    <div className="flex-1 p-6 overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-0 z-10 bg-white p-6 -mx-6">
        <h1 className="text-2xl font-bold">Sales Pipeline</h1>
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
             {onCreateDeal && (
                <Button onClick={() => setShowNewDealForm(true)}>
                   <Plus className="w-4 h-4 mr-2" />
                   New Deal
                </Button>
             )}
             {onImportDeals && onAddCustomField && (
               <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                 <Upload className="w-4 h-4 mr-2" />
                 Import
               </Button>
             )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
          placeholder="Search deals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

       {/* Toolbar (Filters, Columns, Smart Views, Export) */}
        <div className="bg-white rounded-lg border mb-6 relative z-[5]">
           <div className="p-2 border-b border-gray-200 flex items-center justify-between relative z-10">
             <div className="flex items-center space-x-2">
               {/* Filter Button and Menu */}
               <Popover open={showFilterMenu} onOpenChange={setShowFilterMenu}>
                 <PopoverTrigger asChild>
                   <Button
                     variant="outline"
                     size="sm"
                     className="flex items-center"
                   >
                     <Filter className="w-4 h-4 mr-2" />
                     Add Filter
                   </Button>
                 </PopoverTrigger>
                 <PopoverContent className="w-80 p-4">
                   <h3 className="font-medium mb-4">Add Filter</h3>
                   <div className="mb-3">
                     <Label className="block text-sm mb-1 font-medium">Field</Label>
                     <Select
                       value={filterField}
                       onValueChange={(value) => setFilterField(value)}
                     >
                       <SelectTrigger className="w-full">
                         <SelectValue placeholder="Select a field" />
                       </SelectTrigger>
                       <SelectContent>
                         {availableColumns.map(column => (
                           <SelectItem key={column.key} value={column.key}>{column.label}</SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>

                    {/* Determine available operators based on selected field type */}
                    {availableColumns.find(col => col.key === filterField) && (
                       <div className="mb-3">
                         <Label className="block text-sm mb-1 font-medium">Operator</Label>
                         <Select
                           value={filterOperator}
                           onValueChange={(value) => { setFilterOperator(value); setFilterValue(''); setSelectedMultiSelectValues([]); }} // Reset value/multiselect on operator change
                         >
                           <SelectTrigger className="w-full">
                             <SelectValue placeholder="Select an operator" />
                           </SelectTrigger>
                           <SelectContent>
                              {/* Operators for Text, Number, Date, Select, Checkbox, Status */}
                              {availableColumns.find(col => col.key === filterField)?.type === 'text' && (
                                <>
                                  <SelectItem value="contains">Contains</SelectItem>
                                  <SelectItem value="equals">Equals</SelectItem>
                                  {availableColumns.find(col => col.key === filterField)?.options && ( // Text with options (like multi-select)
                                     <SelectItem value="is_any_of">Is any of</SelectItem>
                                  )}
                                  <SelectItem value="is_empty">Is empty</SelectItem>
                                  <SelectItem value="is_not_empty">Is not empty</SelectItem>
                                </>
                              )}
                               {availableColumns.find(col => col.key === filterField)?.type === 'number' && (
                                <><SelectItem value="equals">Equals</SelectItem>
                                  <SelectItem value="greater_than">Greater than</SelectItem>
                                  <SelectItem value="less_than">Less than</SelectItem>
                                  <SelectItem value="is_empty">Is empty</SelectItem>
                                  <SelectItem value="is_not_empty">Is not empty</SelectItem></>
                              )}
                               {availableColumns.find(col => col.key === filterField)?.type === 'date' && (
                                <><SelectItem value="equals">Equals</SelectItem>
                                  <SelectItem value="before">Before</SelectItem>
                                  <SelectItem value="after">After</SelectItem>
                                  <SelectItem value="is_empty">Is empty</SelectItem>
                                  <SelectItem value="is_not_empty">Is not empty</SelectItem></>
                              )}
                               {availableColumns.find(col => col.key === filterField)?.type === 'select' || filterField === 'status' && (
                                <><SelectItem value="is_any_of">Is any of</SelectItem>
                                  <SelectItem value="equals">Equals</SelectItem>
                                   <SelectItem value="is_empty">Is empty</SelectItem>
                                  <SelectItem value="is_not_empty">Is not empty</SelectItem>
                                 </>
                              )}
                               {availableColumns.find(col => col.key === filterField)?.type === 'checkbox' && (
                                <><SelectItem value="equals">Equals</SelectItem>
                                   <SelectItem value="is_empty">Is empty</SelectItem>
                                  <SelectItem value="is_not_empty">Is not empty</SelectItem></>
                              )}

                              {/* Default/Fallback Operators */}
                              {!availableColumns.find(col => col.key === filterField) && (
                                 <SelectItem value="contains">Contains</SelectItem> // Default for unknown type
                              )}
                           </SelectContent>
                         </Select>
                       </div>
                    )}

                   {/* Filter Value Input based on selected field type and operator */}
                   {filterOperator !== 'is_empty' && filterOperator !== 'is_not_empty' && availableColumns.find(col => col.key === filterField) && (
                      <div className="mb-4">
                        <Label className="block text-sm mb-1 font-medium">Value</Label>
                        {availableColumns.find(col => col.key === filterField)?.type === 'select' || (availableColumns.find(col => col.key === filterField)?.type === 'text' && availableColumns.find(col => col.key === filterField)?.options) || filterField === 'status' ? (
                           filterOperator === 'is_any_of' ? (
                             <Select
                                value={selectedMultiSelectValues[0] || ''}
                                onValueChange={(value: string) => {
                                  setSelectedMultiSelectValues([value]);
                                }}
                             >
                               <SelectTrigger className="w-full">
                                 <SelectValue placeholder="Select values" />
                               </SelectTrigger>
                               <SelectContent>
                                 {allowedStatuses.map(status => (
                                   <SelectItem key={status} value={status}>
                                     {status}
                                   </SelectItem>
                                 ))}
                               </SelectContent>
                             </Select>
                           ) : ( // Single select/status equals
                              <Select
                                value={filterValue}
                                onValueChange={handleStatusChange}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select a value" />
                                </SelectTrigger>
                                <SelectContent>
                                  {allowedStatuses.map(status => (
                                    <SelectItem key={status} value={status}>
                                      {status}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                           )
                        ) : availableColumns.find(col => col.key === filterField)?.type === 'number' ? (
                           <Input
                             type="number"
                             value={filterValue}
                             onChange={(e) => setFilterValue(e.target.value)}
                             placeholder="Enter number"
                           />
                        ) : availableColumns.find(col => col.key === filterField)?.type === 'date' ? (
                           <Input
                              type="date"
                              value={filterValue}
                             onChange={(e) => setFilterValue(e.target.value)}
                             placeholder="Select date"
                           />
                        ) : availableColumns.find(col => col.key === filterField)?.type === 'checkbox' ? (
                           <Select
                              value={filterValue}
                              onValueChange={(value) => setFilterValue(value)}
                           >
                             <SelectTrigger className="w-full">
                               <SelectValue placeholder="Select value" />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value="true">Yes</SelectItem>
                               <SelectItem value="false">No</SelectItem>
                             </SelectContent>
                           </Select>
                        ) : ( // Default text input
                           <Input
                             type="text"
                             value={filterValue}
                             onChange={(e) => setFilterValue(e.target.value)}
                             placeholder="Enter value"
                           />
                        )}
                     </div>
                   )}

                   <Button onClick={addFilter} className="w-full">Apply Filter</Button>
                 </PopoverContent>
               </Popover>

               {/* Columns Selector Button and Menu */}
               <Popover open={showColumnSelector} onOpenChange={setShowColumnSelector}>
                 <PopoverTrigger asChild>
                   <Button
                     variant="outline"
                     size="sm"
                     className="flex items-center"
                   >
                     <Columns className="w-4 h-4 mr-2" />
                     Columns
                   </Button>
                 </PopoverTrigger>
                 <PopoverContent className="w-48 p-4">
                   <h3 className="font-medium mb-4">Visible Columns</h3>
                   <div className="space-y-2">
                     {availableColumns.map(column => (
                       <div key={column.key} className="flex items-center justify-between">
                         <label htmlFor={`column-${column.key}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                           {column.label}
                         </label>
                         <Checkbox
                           id={`column-${column.key}`}
                           checked={visibleColumns.some(col => col.key === column.key && col.visible)}
                           onCheckedChange={() => toggleColumnVisibility(column.key)}
                         />
                       </div>
                     ))}
                   </div>
                 </PopoverContent>
               </Popover>

               {/* Smart Views */}
                <Popover open={showSaveViewDialog} onOpenChange={setShowSaveViewDialog}>
                   <PopoverTrigger asChild>
                     <Button variant="outline" size="sm" className="flex items-center" disabled={activeFilters.length === 0}>
                        <Eye className="w-4 h-4 mr-2"/>
                        Smart Views ({smartViews.length})
                     </Button>
                   </PopoverTrigger>
                   <PopoverContent className="w-60 p-4">
                      <h3 className="font-medium mb-4">Smart Views</h3>

                      {smartViews.length > 0 ? (
                         <div className="space-y-2 mb-4">
                            {smartViews.map((view, index) => (
                               <div key={index} className="flex items-center justify-between">
                                  <span
                                     className="text-sm cursor-pointer hover:underline"
                                     onClick={() => loadSmartView(view.filters)}
                                  >
                                     {view.name}
                                  </span>
                                  <Button
                                     variant="ghost"
                                     size="icon"
                                     className="w-4 h-4"
                                     onClick={() => deleteSmartView(view.name)}
                                  >
                                     <X className="w-3 h-3"/>
                                  </Button>
                               </div>
                            ))}
                         </div>
                      ) : (
                         <p className="text-sm text-gray-500 mb-4">No saved smart views.</p>
                      )}

                      {activeFilters.length > 0 && (
                         <div className="border-t pt-4">
                            <h4 className="text-sm font-medium mb-2">Save Current View</h4>
                            <Input
                               placeholder="View Name"
                               value={newViewName}
                               onChange={(e) => setNewViewName(e.target.value)}
                               className="mb-2"
                            />
                            <Button onClick={saveSmartView} className="w-full" disabled={!newViewName.trim()}>Save View</Button>
                         </div>
                      )}
                   </PopoverContent>
                </Popover>


             </div>
             {/* Export Button */}
             <Button variant="outline" size="sm" className="flex items-center">
                <Download className="w-4 h-4 mr-2" />
                Export
             </Button>
           </div>
           {/* Display active filters */}
           {activeFilters.length > 0 && (
              <div className="p-2 flex items-center space-x-2 overflow-x-auto">
                 <span className="text-sm font-medium">Active Filters:</span>
                 {activeFilters.map((filter, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center space-x-1">
                       <span>{availableColumns.find(col => col.key === filter.field)?.label || filter.field} {filter.operator} {String(filter.value)}</span>{/* Simplified display */}
                       <Button variant="ghost" size="icon" className="w-3 h-3 p-0" onClick={() => removeFilter(index)}>
                           <X className="w-3 h-3"/>
                       </Button>
                    </Badge>
                 ))}
                 <Button variant="ghost" size="sm" onClick={() => setActiveFilters([])}>Clear All</Button>
              </div>
           )}
        </div>

      {/* Views Container */}
      <div className="flex-1 overflow-x-auto">
        {view === 'table' ? (
          <TableView
            deals={filteredDeals}
            visibleColumns={visibleColumns}
            onDealSelect={onDealSelect}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            onDealUpdate={onDealUpdate}
            statusLabels={statusLabels}
            statusColors={statusColors}
            allowedStatuses={allowedStatuses}
          />
        ) : (
          <KanbanView
            deals={filteredDeals}
            onDealSelect={onDealSelect}
            onDealUpdate={onDealUpdate}
            statusLabels={statusLabels}
            statusColors={statusColors}
            allowedStatuses={allowedStatuses}
          />
        )}
      </div>

      {/* New Deal Dialog */}
      <Dialog open={showNewDealForm} onOpenChange={setShowNewDealForm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newDeal.name}
                onChange={(e) => setNewDeal({ ...newDeal, name: e.target.value })}
                className="col-span-3"
              />
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="value" className="text-right">
                Value
              </Label>
              <Input
                id="value"
                type="number"
                value={newDeal.value || ''} // Use empty string for 0 to show placeholder
                onChange={(e) => setNewDeal({ ...newDeal, value: parseFloat(e.target.value) || 0 })}
                className="col-span-3"
              />
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                Status
              </Label>
              <Select
                value={newDeal.status}
                onValueChange={(value: string) => setNewDeal({ ...newDeal, status: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {allowedStatuses.map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expected_close_date" className="text-right">
                Expected Close Date
              </Label>
              <Input
                id="expected_close_date"
                type="date"
                value={newDeal.expected_close_date}
                onChange={(e) => setNewDeal({ ...newDeal, expected_close_date: e.target.value })}
                className="col-span-3"
              />
            </div>

             {/* Custom Fields for New Deal */}
             {customFields && customFields.filter(cf => cf.entity_type === 'deal').map(field => (
                <div key={field.id} className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor={`new-deal-custom-${field.name}`} className="text-right">
                      {field.name}
                   </Label>
                   {field.field_type === 'text' && (
                      <Input
                         id={`new-deal-custom-${field.name}`}
                         value={newDeal.custom_fields?.[field.name.toLowerCase().replace(/\s+/g, '_')] || ''}
                         onChange={(e) => setNewDeal({
                            ...newDeal,
                            custom_fields: {
                               ...newDeal.custom_fields,
                               [field.name.toLowerCase().replace(/\s+/g, '_')]: e.target.value,
                            },
                         })}
                         className="col-span-3"
                      />
                   )}
                    {field.field_type === 'number' && (
                       <Input
                          id={`new-deal-custom-${field.name}`}
                          type="number"
                          value={newDeal.custom_fields?.[field.name.toLowerCase().replace(/\s+/g, '_')] || ''}
                          onChange={(e) => setNewDeal({
                             ...newDeal,
                             custom_fields: {
                                ...newDeal.custom_fields,
                                [field.name.toLowerCase().replace(/\s+/g, '_')]: parseFloat(e.target.value) || 0,
                             },
                          })}
                          className="col-span-3"
                       />
                    )}
                    {field.field_type === 'date' && (
                       <Input
                          id={`new-deal-custom-${field.name}`}
                          type="date"
                          value={newDeal.custom_fields?.[field.name.toLowerCase().replace(/\s+/g, '_')] || ''}
                          onChange={(e) => setNewDeal({
                             ...newDeal,
                             custom_fields: {
                                ...newDeal.custom_fields,
                                [field.name.toLowerCase().replace(/\s+/g, '_')]: e.target.value,
                             },
                          })}
                          className="col-span-3"
                       />
                    )}
                     {field.field_type === 'checkbox' && (
                        <Checkbox
                           id={`new-deal-custom-${field.name}`}
                           checked={!!newDeal.custom_fields?.[field.name.toLowerCase().replace(/\s+/g, '_')] }
                            onCheckedChange={(checked) => setNewDeal({
                             ...newDeal,
                             custom_fields: {
                                ...newDeal.custom_fields,
                                [field.name.toLowerCase().replace(/\s+/g, '_')]: checked,
                             },
                          })}
                           className="col-span-3"
                        />
                     )}
                     {(field.field_type === 'select' || field.field_type === 'text') && field.options && (
                         <Select
                             value={newDeal.custom_fields?.[field.name.toLowerCase().replace(/\s+/g, '_')] || ''}
                             onValueChange={(value) => setNewDeal({
                                ...newDeal,
                                custom_fields: {
                                   ...newDeal.custom_fields,
                                   [field.name.toLowerCase().replace(/\s+/g, '_')]: value,
                                },
                             })}
                         >
                             <SelectTrigger className="col-span-3">
                                 <SelectValue placeholder="Select value" />
                             </SelectTrigger>
                             <SelectContent>
                                 {field.options.map(option => (
                                     <SelectItem key={option} value={option}>{option}</SelectItem>
                                 ))}
                             </SelectContent>
                         </Select>
                     )}
                </div>
             ))}

          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleCreateDeal}>Save Deal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
       {showImportDialog && onImportDeals && onAddCustomField && (
          <CSVImport
            isOpen={showImportDialog}
            onClose={() => setShowImportDialog(false)}
            onImport={onImportDeals}
            onAddCustomField={onAddCustomField}
          />
       )}

    </div>
  );
};

export default OpportunitiesView;