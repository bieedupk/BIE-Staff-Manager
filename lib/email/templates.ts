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
    subject: "Welcome to {{organization_name}} — Next steps",
    body_text:
      "Assalamu alaikum {{employee_name}},\n\nOn behalf of the {{organization_name}}, welcome to our team. We are pleased to appoint you to the position of {{designation}} and trust that your skills and commitment will contribute to our shared mission.\n\nDepartments: {{departments}}\nUsername / email: {{email}}\n\nTo set up a secure password for your account, please follow this link:\n{{setup_link}}\n\nOur mission is to provide high-quality, faith-centered education. We expect all team members to uphold our values and serve with sincerity, responsibility, professionalism, punctuality, and a spirit of teamwork. Please take time to review organizational guidelines and reach out to your manager with any questions.\n\nWe wish you every success in your new role and look forward to the positive impact you will make.\n\nIf you need assistance, contact us:\nEmail: {{contact_email}}\nPhone: {{contact_phone}}\nAddress: {{contact_address}}\n\nWarm regards,\nBoard of Islamic Education",
    body_html: `
      <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#111; line-height:1.5;">
        <p>Assalamu alaikum <strong>{{employee_name}}</strong>,</p>
        <p>On behalf of the <strong>{{organization_name}}</strong>, welcome to our team. We are pleased to appoint you as <strong>{{designation}}</strong> in <strong>{{departments}}</strong>.</p>
        <h3 style="margin-top:0.75rem;">Account access</h3>
        <p>Your username / email: <strong>{{email}}</strong></p>
        <p>Please set a secure password for your account using the link below:</p>
        <p style="word-break: break-all;">{{setup_link}}</p>
        <h3 style="margin-top:0.75rem;">Our mission & expectations</h3>
        <p>Our mission is to provide high-quality, faith-centered education. We expect all staff to act with sincerity, responsibility, professionalism, punctuality, and a collaborative spirit.</p>
        <ul>
          <li>Sincerity in service to our students and community</li>
          <li>Responsibility to assigned duties and learners</li>
          <li>Professional conduct and respectful communication</li>
          <li>Punctuality and reliable attendance</li>
          <li>Teamwork and supportive collaboration</li>
        </ul>
        <p>We wish you every success in your role and look forward to your contributions.</p>
        <h4 style="margin-top:0.75rem;">Contact</h4>
        <p>Email: {{contact_email}}<br/>Phone: {{contact_phone}}<br/>Address: {{contact_address}}</p>
        <p>Warm regards,<br/>Board of Islamic Education</p>
      </div>
    `,
    contact_email: "",
    contact_phone: "",
    contact_address: "",
    is_active: true,
    created_at: "",
    updated_at: ""
  };
}
