-- Leads pueden dejar un telefono ademas de/en vez de email para seguimiento
-- comercial. Opcional: el CHECK solo restringe el largo cuando hay valor.
alter table kardo_core.leads add column if not exists phone text;

do $$ begin
  alter table kardo_core.leads
    add constraint leads_phone_format
    check (phone is null or char_length(phone) between 3 and 40)
    not valid;
exception when duplicate_object then null;
end $$;
alter table kardo_core.leads validate constraint leads_phone_format;
