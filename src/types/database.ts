export interface Lead {
  id: string;
  team_id: string;
  name: string;
  status: 'potential' | 'contacted' | 'qualified' | 'closed';
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  description?: string;
  owner_id?: string;
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at: string;
  activities?: Activity[];
}

export interface Deal {
  id: string;
  team_id: string;
  name: string;
  status: string;
  value: number;
  expected_close_date?: string;
  lead_id?: string;
  owner_id?: string;
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at: string;
  activities?: Activity[];
}

export interface Activity {
  id: string;
  team_id: string;
  entity_type: 'lead' | 'deal';
  entity_id: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'task' | 'custom';
  title?: string;
  content?: string;
  template_id?: string;
  template_data: Record<string, any>;
  author_id: string;
  created_at: string;
}

export interface ActivityTemplate {
  id: string;
  team_id: string;
  name: string;
  fields: Array<{
    name: string;
    type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
    options?: string[];
    required?: boolean;
  }>;
  created_at: string;
}

export interface CustomField {
  id: string;
  team_id: string;
  name: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  entity_type: 'lead' | 'deal';
  options: string[];
  sort_order: number;
  created_at: string;
}

export interface ActivityTemplate {
  id: string;
  team_id: string;
  name: string;
  fields: Array<{
    name: string;
    type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
    options?: string[];
    required?: boolean;
  }>;
  created_at: string;
}

export interface SavedFilter {
  id: string;
  team_id: string;
  name: string;
  entity_type: 'lead' | 'deal';
  filters: Record<string, any>;
  is_default: boolean;
  created_by: string;
  created_at: string;
}
