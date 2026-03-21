// backend/routes/documents.js — REPLACE existing file

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

// GET /api/documents
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false });
    
    if(error) {
      console.error('Get docs error:', error);
      return res.status(500).json({ error: 'Could not load documents' });
    }
    res.json({ documents: data || [] });
  } catch(err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/documents/upload
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if(!req.file) return res.status(400).json({ error: 'No file provided' });
    
    const { originalname, mimetype, size, buffer } = req.file;
    const userId = req.user.userId;
    
    const timestamp = Date.now();
    const safeName = originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${userId}/${timestamp}_${safeName}`;

    // Get file type/category
    let fileType = 'Other';
    if(mimetype.includes('pdf')) fileType = 'PDF';
    else if(mimetype.includes('image')) fileType = 'Image';
    else if(mimetype.includes('word') || originalname.endsWith('.doc') || originalname.endsWith('.docx')) fileType = 'Document';
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, buffer, {
        contentType: mimetype,
        upsert: false
      });
    
    if(uploadError) {
      console.error('Storage error:', uploadError);
      return res.status(500).json({ error: 'Storage upload failed: ' + uploadError.message });
    }
    
    // Save to documents table — include ALL required fields
    const insertData = {
      user_id: userId,
      name: originalname,
      file_path: filePath,
      mime_type: mimetype,
      size: size,
      created_at: new Date().toISOString()
    };

    // Add 'type' field if your table requires it
    insertData.type = fileType;

    const { data: doc, error: dbError } = await supabase
      .from('documents')
      .insert([insertData])
      .select()
      .single();
    
    if(dbError) {
      console.error('DB error:', dbError);
      // Clean up uploaded file
      await supabase.storage.from('documents').remove([filePath]);
      return res.status(500).json({ error: 'Could not save: ' + dbError.message });
    }
    
    res.json({ id: doc.id, name: doc.name, size: doc.size, message: 'Uploaded successfully' });
    
  } catch(err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// GET /api/documents/:id/download
router.get('/:id/download', auth, async (req, res) => {
  try {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId)
      .single();
    
    if(error || !doc) return res.status(404).json({ error: 'Document not found' });
    
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.file_path, 60);
    
    if(urlError) return res.status(500).json({ error: 'Could not create download link' });
    
    res.json({ url: signedUrl.signedUrl, name: doc.name });
  } catch(err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { data: doc } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId)
      .single();
    
    if(doc) {
      await supabase.storage.from('documents').remove([doc.file_path]);
    }
    
    await supabase.from('documents').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: 'Could not delete' });
  }
});

module.exports = router;
