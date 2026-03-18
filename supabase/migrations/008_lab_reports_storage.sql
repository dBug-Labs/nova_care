-- Create Storage Bucket for Lab Reports
INSERT INTO storage.buckets (id, name, public) 
VALUES ('lab-reports', 'lab-reports', false) 
ON CONFLICT (id) DO NOTHING;

-- Policies for lab-reports
-- Allow users to upload to their own folder (folder name is their patient_id)
CREATE POLICY "Users can upload their own lab reports" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'lab-reports' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own reports
CREATE POLICY "Users can read their own lab reports" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'lab-reports' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own reports
CREATE POLICY "Users can update their own lab reports" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'lab-reports' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Note: Depending on doctor logic, doctor read access can be added similarly.
