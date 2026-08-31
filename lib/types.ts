export type UserRole = "super_admin" | "admin" | "supervisor" | "employee";
export type EmployeeStatus = "active" | "disabled";
export type WelcomeEmailMode = "automatic" | "manual";
export type WelcomeEmailStatus = "pending" | "sending" | "sent" | "failed" | "skipped";
export type AttendanceStatus = "Present" | "Absent" | "Late" | "Half Day" | "Pending";
export type LeaveStatus = "Pending" | "Approved" | "Rejected";
export type TaskStatus = "Pending" | "In Progress" | "Completed" | "Overdue";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type DailyReportReviewStatus = "pending_review" | "reviewed";

export type OrganizationSettings = {
  id: string;
  organization_name: string;
  short_name: string;
  timezone: string;
  office_start_time: string;
  office_end_time: string;
  late_threshold_time: string;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  department: string | null;
  department_id: string | null;
  designation: string | null;
  supervisor_id: string | null;
  joining_date: string | null;
  status: EmployeeStatus;
  welcome_email_mode: WelcomeEmailMode;
  welcome_email_status: WelcomeEmailStatus;
  employee_type: string | null;
  responsibilities: string | null;
  created_at: string;
};

export type Department = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
};

export type EmployeeDepartment = {
  employee_id: string;
  department_id: string;
  other_department: string | null;
  is_primary: boolean;
  created_at: string;
  departments?: Department | Department[] | null;
};

export type AuthorizedDevice = {
  id: string;
  employee_id: string;
  device_name: string;
  device_token_hash: string;
  status: "active" | "disabled";
  registered_by: string | null;
  registered_at: string;
  last_used_at: string | null;
  last_ip: string | null;
  last_user_agent: string | null;
  created_at: string;
};

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_hours: number | null;
  status: AttendanceStatus;
  created_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "email" | "department" | "department_id" | "designation"> | null;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: LeaveStatus;
  admin_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "department" | "department_id"> | null;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  assigned_by: string;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
  department: string | null;
  progress_note: string | null;
  completion_note: string | null;
  completed_at: string | null;
  created_at: string;
  assignee?: Pick<Profile, "id" | "full_name" | "department" | "department_id"> | null;
  assigner?: Pick<Profile, "full_name"> | null;
};

export type DailyReport = {
  id: string;
  employee_id: string;
  report_date: string;
  work_summary: string;
  tasks_completed: string;
  pending_work: string;
  challenges: string | null;
  hours_worked: number;
  tomorrow_plan: string | null;
  review_rating: number | null;
  review_status: DailyReportReviewStatus;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "department" | "department_id" | "designation"> | null;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles?: Pick<Profile, "full_name"> | null;
};

export type EmailTemplate = {
  id: string;
  template_key: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailLogStatus = "sent" | "failed" | "skipped";
