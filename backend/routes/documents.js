// backend/routes/documents.js — NEW FILE
// Supabase Storage ke saath document upload/download/delete

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Auth middleware
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if(!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/documents — list user's documents
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false });
    
    if(error) return res.status(500).json({ error: 'Could not load documents' });
    res.json({ documents: data || [] });
  } catch(err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/documents/upload — upload a document
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if(!req.file) return res.status(400).json({ error: 'No file provided' });
    
    const { originalname, mimetype, size, buffer } = req.file;
    const userId = req.user.userId;
    
    // Create unique file path: userId/timestamp_filename
    const timestamp = Date.now();
    const safeName = originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${userId}/${timestamp}_${safeName}`;
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, buffer, {
        contentType: mimetype,
        upsert: false
      });
    
    if(uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({ error: 'Upload failed — ' + uploadError.message });
    }
    
    // Save metadata to documents table
    const { data: doc, error: dbError } = await supabase
      .from('documents')
      .insert([{
        user_id: userId,
        name: originalname,
        file_path: filePath,
        mime_type: mimetype,
        size: size,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if(dbError) {
      console.error('DB insert error:', dbError);
      // Try to delete the uploaded file
      await supabase.storage.from('documents').remove([filePath]);
      return res.status(500).json({ error: 'Could not save document metadata' });
    }
    
    res.json({ id: doc.id, name: doc.name, size: doc.size });
    
  } catch(err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /api/documents/:id/download — get signed download URL
router.get('/:id/download', auth, async (req, res) => {
  try {
    // Get document metadata
    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId)
      .single();
    
    if(error || !doc) return res.status(404).json({ error: 'Document not found' });
    
    // Create signed URL (valid for 60 seconds)
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.file_path, 60);
    
    if(urlError) return res.status(500).json({ error: 'Could not create download link' });
    
    res.json({ url: signedUrl.signedUrl, name: doc.name });
  } catch(err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/documents/:id — delete a document
router.delete('/:id', auth, async (req, res) => {
  try {
    // Get document to find file path
    const { data: doc, error } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId)
      .single();
    
    if(error || !doc) return res.status(404).json({ error: 'Document not found' });
    
    // Delete from Storage
    await supabase.storage.from('documents').remove([doc.file_path]);
    
    // Delete from DB
    await supabase.from('documents').delete().eq('id', req.params.id);
    
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: 'Could not delete' });
  }
});

module.exports = router;

// ============================================================
// SETUP STEPS:
// ============================================================
//
// 1. Install multer in backend:
//    cd backend && npm install multer
//
// 2. Add to backend/server.js:
//    const documentsRoutes = require('./routes/documents');
//    app.use('/api/documents', documentsRoutes);
//
// 3. Supabase SQL - create documents table:
//    CREATE TABLE IF NOT EXISTS documents (
//      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
//      name VARCHAR(255) NOT NULL,
//      file_path TEXT NOT NULL,
//      mime_type VARCHAR(100),
//      size INTEGER,
//      created_at TIMESTAMPTZ DEFAULT NOW()
//    );
//
// 4. Supabase Storage - add RLS policy:
//    Go to Storage → documents bucket → Policies → New Policy
//    Name: "Users can manage own files"
//    Allowed operations: SELECT, INSERT, DELETE
//    Policy: (auth.uid()::text = (storage.foldername(name))[1])
//    
//    Since we use service key in backend, this policy doesn't block us.
//    The service key bypasses RLS.
//
// ============================================================
