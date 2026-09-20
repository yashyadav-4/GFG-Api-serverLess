const axios = require('axios');
const { logErrorToAdmin } = require('./logger');

const RELAY_SECRET = process.env.RELAY_SECRET || 'LEMONJI';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];
const pickUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const safeInt = (val) => {
  if(val === null || val === undefined || val === '') return 0;
  const n = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
};

const safeStr = (val) => String(val || '').trim();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if(req.method === 'OPTIONS') return res.status(200).end();

  const key = (req.headers['x-api-key'] || req.query.secret || '').trim();
  if(RELAY_SECRET && key !== RELAY_SECRET){
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const handle = (req.query.handle || '').trim();
  if(!handle){
    return res.status(400).json({ error: 'HANDLE_REQUIRED' });
  }

  const ua = pickUA();
  const commonHeaders = {
    'User-Agent': ua,
    'Referer': 'https://www.geeksforgeeks.org/',
    'Origin': 'https://www.geeksforgeeks.org',
    'Accept': 'application/json, text/plain, */*',
  };

  try{
    let profile = null;
    try{
      const profileUrl = `https://authapi.geeksforgeeks.org/api-get/user-profile-info/?handle=${encodeURIComponent(handle)}&article_count=false&redirect=true`;
      const profileRes = await axios.get(profileUrl, {
        headers: commonHeaders,
        timeout: 10000,
      });

      if(profileRes.data?.data){
        profile = profileRes.data.data;
      }
    }catch(err){
      if(err.response?.status === 400 || err.response?.data?.message === 'User not found!' || err.response?.status === 404){
        profile = null;
      }else{
        console.warn('[GFG Relay] Profile fetch warning:', err.message);
      }
    }

    if(!profile){
      await logErrorToAdmin({
        source: 'GFG-Serverless',
        level: 'warn',
        message: `GFG user not found: handle="${handle}"`,
        handle,
      }).catch(()=>{});
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: `User not found: ${handle}` });
    }

    let submissionsResult = {};
    try{
      const subUrl = 'https://practiceapi.geeksforgeeks.org/api/v1/user/problems/submissions/';
      const subRes = await axios.post(
        subUrl,
        { handle, requestType: '', year: '', month: '' },
        {
          headers: {
            ...commonHeaders,
            'Content-Type': 'application/json',
          },
          timeout: 12000,
        }
      );
      if(subRes.data?.result){
        submissionsResult = subRes.data.result;
      }
    }catch(err){
      console.warn('[GFG Relay] Submissions fetch warning:', err.message);
    }

    const solvedByDifficulty = {
      school: 0,
      basic: 0,
      easy: 0,
      medium: 0,
      hard: 0,
    };

    const allProblemsMap = new Map();
    for(const [diffKey, problemsObj] of Object.entries(submissionsResult || {})){
      const lowerKey = diffKey.toLowerCase();
      if(problemsObj && typeof problemsObj === 'object'){
        const count = Object.keys(problemsObj).length;
        if(solvedByDifficulty[lowerKey] !== undefined){
          solvedByDifficulty[lowerKey] = count;
        }

        for(const [probId, prob] of Object.entries(problemsObj)){
          let submittedAtIso = null;
          if(prob.user_subtime){
            try{
              const cleanSubtime = prob.user_subtime.trim();
              submittedAtIso = new Date(`${cleanSubtime} +05:30`).toISOString();
            }catch(_){
              submittedAtIso = prob.user_subtime;
            }
          }

          const probKey = String(prob.slug || probId).trim();
          if(!allProblemsMap.has(probKey)){
            allProblemsMap.set(probKey, {
              id: probId,
              difficulty: diffKey,
              slug: prob.slug || '',
              title: prob.pname || prob.slug || 'Problem',
              lang: prob.lang || 'Unknown',
              submittedAt: submittedAtIso,
              rawSubtime: prob.user_subtime || '',
            });
          }
        }
      }
    }

    const allProblems = Array.from(allProblemsMap.values());

    allProblems.sort((a, b) => {
      const tA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return tB - tA;
    });

    const dateMap = {};
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let solvedThisMonth = 0;

    for(const p of allProblems){
      if(!p.rawSubtime) continue;
      const dateStr = p.rawSubtime.split(' ')[0];
      if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){
        dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;
        if(dateStr.startsWith(currentMonthPrefix)){
          solvedThisMonth++;
        }
      }
    }

    const heatmap = Object.entries(dateMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const sortedDates = Object.keys(dateMap).sort();
    let computedCurrentStreak = 0;
    let computedMaxStreak = 0;
    let tempStreak = 0;
    let prevDate = null;

    for(const dStr of sortedDates){
      const cur = new Date(dStr + 'T00:00:00');
      if(!prevDate){
        tempStreak = 1;
      }else{
        const diffDays = Math.round((cur - prevDate) / (1000 * 60 * 60 * 24));
        if(diffDays === 1){
          tempStreak++;
        }else if(diffDays > 1){
          tempStreak = 1;
        }
      }
      if(tempStreak > computedMaxStreak) computedMaxStreak = tempStreak;
      prevDate = cur;
    }

    if(sortedDates.length > 0){
      const lastDate = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysSinceLast = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));
      if(daysSinceLast <= 1){
        computedCurrentStreak = tempStreak;
      }else{
        computedCurrentStreak = 0;
      }
    }

    const currentStreak = Math.max(computedCurrentStreak, safeInt(profile.pod_solved_current_streak));
    const bestStreak = Math.max(computedMaxStreak, safeInt(profile.pod_solved_longest_streak));

    const languageDistribution = {};
    for(const p of allProblems){
      const l = p.lang || 'Unknown';
      languageDistribution[l] = (languageDistribution[l] || 0) + 1;
    }

    const data = {
      handle,
      name: safeStr(profile.name || handle),
      profilePicture: safeStr(profile.profile_image_url || ''),
      codingScore: safeInt(profile.score),
      monthlyScore: safeInt(profile.monthly_score),
      totalSolved: safeInt(profile.total_problems_solved) || allProblems.length,
      instituteRank: safeInt(profile.institute_rank),
      institution: safeStr(profile.institute_name || profile.organization_name || ''),
      solvedByDifficulty,
      heatmap,
      activeDays: Object.keys(dateMap).length,
      currentStreak,
      bestStreak,
      solvedThisMonth,
      problems: allProblems.map(p => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        lang: p.lang,
        difficulty: p.difficulty,
        submittedAt: p.submittedAt,
      })),
      recentSubmissions: allProblems.slice(0, 25).map(p => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        lang: p.lang,
        difficulty: p.difficulty,
        submittedAt: p.submittedAt,
      })),
      languageDistribution,
    };

    return res.status(200).json({ success: true, data });

  }catch(err){
    if(err.response?.status === 404){
      await logErrorToAdmin({
        source: 'GFG-Serverless',
        level: 'warn',
        message: `GFG user not found: handle="${handle}"`,
        handle,
      }).catch(()=>{});
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: `User not found: ${handle}` });
    }
    if(err.response?.status === 429){
      await logErrorToAdmin({
        source: 'GFG-Serverless',
        level: 'error',
        message: `GFG rate limit exceeded: handle="${handle}"`,
        handle,
      }).catch(()=>{});
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'Rate limited by GeeksforGeeks' });
    }
    console.error('[GFG Relay] Error:', err.message);
    await logErrorToAdmin({
      source: 'GFG-Serverless',
      level: 'error',
      message: `GFG Relay error for handle="${handle}": ${err.message}`,
      handle,
    }).catch(()=>{});
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};
