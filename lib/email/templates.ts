import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailTemplate } from "@/lib/types";

export const welcomeTemplateKey = "employee_welcome";
export const organizationName = "Board of Islamic Education";

export async function getWelcomeEmailTemplate() {
  const { data, error } = await createAdminClient()
    .from("email_templates")
    .select("*")
    .eq("template_key", welcomeTemplateKey)
    .maybeSingle<EmailTemplate>();

  if (error || !data) return defaultWelcomeEmailTemplate();
  return data;
}

export function renderTemplate(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (content, [key, value]) => content.replaceAll(`{{${key}}}`, value),
    template
  );
}

export function defaultWelcomeEmailTemplate(): EmailTemplate {
  return {
    id: "",
    template_key: welcomeTemplateKey,
    subject: "Welcome to {{organization_name}}",
    body_text:
      "Dear {{employee_name}},\n\nYou have been appointed to this position by the {{organization_name}}. We warmly welcome you to our team and look forward to working with you.\n\nDesignation: {{designation}}\nDepartments: {{departments}}\nUsername / email: {{email}}\n\nPassword setup:\n{{setup_link}}\n\nContact:\nEmail: {{contact_email}}\nPhone: {{contact_phone}}\nAddress: {{contact_address}}",
    body_html: null,
    contact_email: "",
    contact_phone: "",
    contact_address: "",
    is_active: true,
    created_at: "",
    updated_at: ""
  };
}
