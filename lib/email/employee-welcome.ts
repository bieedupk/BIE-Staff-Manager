import "server-only";

import { departmentDisplayName } from "@/lib/department-utils";
import { sendEmail } from "@/lib/email/send-email";
import { getWelcomeEmailTemplate, organizationName, renderTemplate } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Department, EmailLogStatus, EmailTemplate } from "@/lib/types";

type WelcomeEmailInput = {
  employeeId: string;
  employeeName: string;
  email: string;
  designation: string | null;
  departments: Department[];
  otherDepartmentText: string | null;
};

type EmailResult = {
  status: EmailLogStatus;
  message: string;
  providerMessageId?: string | null;
};

export async function sendEmployeeWelcomeEmail(input: WelcomeEmailInput): Promise<EmailResult> {
  const template = await getWelcomeEmailTemplate();
  const setupLink = await createSetupLink(input.email);
  const replacements = {
    organization_name: organizationName,
    employee_name: input.employeeName,
    designation: input.designation || "-",
    departments: departmentNames(input.departments, input.otherDepartmentText).join(", ") || "-",
    email: input.email,
    setup_link: setupLink ?? "Please use Forgot Password to set your password.",
    contact_email: template.contact_email || "-",
    contact_phone: template.contact_phone || "-",
    contact_address: template.contact_address || "-"
  };
  const subject = renderTemplate(template.subject, replacements);
  const text = renderTemplate(template.body_text, replacements);
  const html = template.body_html ? renderTemplate(template.body_html, replacements) : undefined;

  if (!template.is_active) {
    await logEmailAttempt(input, template, subject, "skipped", "Template is inactive.", null, {
      setup_link_generated: Boolean(setupLink)
    });
    return { status: "skipped", message: "Welcome email template is inactive." };
  }

  const result = await sendEmail({
    to: input.email,
    subject,
    text,
    html
  });

  await logEmailAttempt(
    input,
    template,
    subject,
    result.status,
    result.status === "sent" ? null : result.message,
    result.providerMessageId ?? null,
    {
      missing_env: result.missingEnv ?? [],
      setup_link_generated: Boolean(setupLink)
    }
  );

  return {
    status: result.status,
    message: result.message,
    providerMessageId: result.providerMessageId ?? null
  };
}

function departmentNames(departments: Department[], otherDepartmentText: string | null) {
  return departments.map((department) => {
    const name = departmentDisplayName(department.name);
    return name === "Other" && otherDepartmentText ? otherDepartmentText : name;
  });
}

async function createSetupLink(email: string) {
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) return null;

  try {
    const { data, error } = await createAdminClient().auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${appBaseUrl.replace(/\/$/, "")}/auth/callback`
      }
    });

    if (error) return null;
    return data.properties?.action_link ?? null;
  } catch {
    return null;
  }
}

async function logEmailAttempt(
  input: WelcomeEmailInput,
  template: EmailTemplate,
  subject: string,
  status: EmailLogStatus,
  errorMessage: string | null,
  providerMessageId: string | null,
  metadata: Record<string, unknown>
) {
  try {
    await createAdminClient().from("email_logs").insert({
      employee_id: input.employeeId,
      recipient_email: input.email,
      template_key: template.template_key,
      subject,
      status,
      provider: "resend",
      provider_message_id: providerMessageId,
      error_message: errorMessage,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      metadata
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email] email log failed", error instanceof Error ? error.message : "unknown");
    }
  }
}
