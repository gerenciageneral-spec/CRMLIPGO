-- Add pdfaprobacion column to solicitudesturnos table
ALTER TABLE public.solicitudesturnos 
ADD COLUMN IF NOT EXISTS pdfaprobacion text NULL;

-- Add comment to describe the column
COMMENT ON COLUMN public.solicitudesturnos.pdfaprobacion IS 'URL del PDF generado al momento de la aprobación';
