// backend/routes/family.js - NEW FILE BANAO
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Middleware
function auth(req,res,next){
  const token=(req.headers.authorization||'').replace('Bearer ','');
  if(!token) return res.status(401).json({error:'No token'});
  try{ req.user=jwt.verify(token,process.env.JWT_SECRET); next(); }
  catch(e){ res.status(401).json({error:'Invalid token'}); }
}

// GET members
router.get('/members', auth, async (req,res)=>{
  const {data}=await supabase.from('family_members').select('*').eq('user_id',req.user.userId);
  res.json({members:data||[]});
});

// POST add member
router.post('/members', auth, async (req,res)=>{
  const {name,email,relationship}=req.body;
  if(!name) return res.status(400).json({error:'Name required'});
  // Check limit
  const {data:existing}=await supabase.from('family_members').select('id').eq('user_id',req.user.userId);
  if(existing&&existing.length>=5) return res.status(400).json({error:'Max 5 family members'});
  const {data,error}=await supabase.from('family_members').insert([{user_id:req.user.userId,name,email:email||null,relationship:relationship||null}]).select().single();
  if(error) return res.status(500).json({error:'Could not add member'});
  res.json({member:data});
});

// DELETE member
router.delete('/members/:id', auth, async (req,res)=>{
  await supabase.from('family_members').delete().eq('id',req.params.id).eq('user_id',req.user.userId);
  res.json({success:true});
});

module.exports = router;
