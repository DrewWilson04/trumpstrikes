// Military Intelligence Dashboard - Cloudflare Worker
// Environment variables needed: OPENAI_API_KEY, NEWS_API_KEY, FINNHUB_API_KEY, REDDIT_CLIENT_ID, REDDIT_SECRET

// In-memory storage for latest analysis
let latestAnalysis = {
  mini: null,
  deep: null,
  lastMiniRun: null,
  lastDeepRun: null,
  nextMiniRun: null,
  nextDeepRun: null
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Root endpoint
      if (path === '/' || path === '') {
        return new Response(JSON.stringify({
          status: 'online',
          message: 'Military Intelligence Dashboard API with AI Analysis',
          endpoints: {
            analysis: '/api/analysis - Get latest AI predictions',
            score: '/api/score - Aggregated threat score',
            stock: '/api/stock/SYMBOL - Defense contractor stock data',
            news: '/api/news - Military/geopolitical news',
            flights: '/api/flights - Military flight tracking',
            navy: '/api/navy - Naval vessel positions',
            reddit: '/api/reddit - Social intelligence',
            runMini: '/api/run-mini - Manually trigger 4o-mini analysis',
            runDeep: '/api/run-deep - Manually trigger 4o deep analysis'
          }
        }), { headers: corsHeaders });
      }

      // Get latest analysis
      if (path === '/api/analysis') {
        return new Response(JSON.stringify(latestAnalysis), { headers: corsHeaders });
      }

      // Manual trigger for mini analysis
      if (path === '/api/run-mini') {
        const analysis = await runMiniAnalysis(env);
        return new Response(JSON.stringify(analysis), { headers: corsHeaders });
      }

      // Manual trigger for deep analysis
      if (path === '/api/run-deep') {
        const analysis = await runDeepAnalysis(env);
        return new Response(JSON.stringify(analysis), { headers: corsHeaders });
      }

      // Aggregated threat score
      if (path === '/api/score') {
        const score = await calculateThreatScore(env);
        return new Response(JSON.stringify(score), { headers: corsHeaders });
      }

      // Stock data for defense contractors
      if (path.startsWith('/api/stock/')) {
        const symbol = path.split('/')[3];
        const stockData = await getStockData(symbol, env);
        return new Response(JSON.stringify(stockData), { headers: corsHeaders });
      }

      // News endpoint
      if (path === '/api/news') {
        const news = await getNews(env);
        return new Response(JSON.stringify(news), { headers: corsHeaders });
      }

      // Flight tracking
      if (path === '/api/flights') {
        const flights = await getMilitaryFlights(env);
        return new Response(JSON.stringify(flights), { headers: corsHeaders });
      }

      // Navy tracking
      if (path === '/api/navy') {
        const navy = await getNavyData(env);
        return new Response(JSON.stringify(navy), { headers: corsHeaders });
      }

      // Reddit intelligence
      if (path === '/api/reddit') {
        const reddit = await getRedditIntel(env);
        return new Response(JSON.stringify(reddit), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: 'Endpoint not found' }), { 
        status: 404, 
        headers: corsHeaders 
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }
  },

  // Scheduled trigger for automated analysis
  async scheduled(event, env, ctx) {
    const now = new Date();
    const hour = now.getUTCHours() - 5; // Convert to EST
    const minute = now.getUTCMinutes();
    const day = now.getUTCDay();

    // Skip weekends for market-based scheduling
    const isWeekend = day === 0 || day === 6;
    
    const isMarketHours = !isWeekend && hour >= 9.5 && hour < 16; // 9:30 AM - 4 PM
    const isAfterMarket = !isWeekend && hour >= 16 && hour < 19; // 4 PM - 7 PM
    const isEvening = hour >= 19 || hour < 6; // 7 PM - 6 AM
    const isPreMarket = !isWeekend && hour >= 6 && hour < 9.5; // 6 AM - 9:30 AM

    try {
      // Market Hours: 4o-mini every 30 min, 4o every hour
      if (isMarketHours) {
        if (minute === 0 || minute === 30) {
          ctx.waitUntil(runMiniAnalysis(env));
        }
        if (minute === 0) {
          ctx.waitUntil(runDeepAnalysis(env));
        }
      }

      // After-Market: Alternating every hour
      else if (isAfterMarket) {
        if (minute === 0) {
          if (hour % 2 === 0) {
            ctx.waitUntil(runDeepAnalysis(env));
          } else {
            ctx.waitUntil(runMiniAnalysis(env));
          }
        }
      }

      // Evening: 4o-mini every 3 hours, 4o at 9 PM and 6 AM
      else if (isEvening) {
        if (minute === 0) {
          if (hour === 21 || hour === 6) { // 9 PM or 6 AM
            ctx.waitUntil(runDeepAnalysis(env));
          }
          if ([19, 22, 1, 4].includes(hour)) { // 7 PM, 10 PM, 1 AM, 4 AM
            ctx.waitUntil(runMiniAnalysis(env));
          }
        }
      }

      // Pre-Market: 4o-mini every hour
      else if (isPreMarket) {
        if (minute === 0) {
          ctx.waitUntil(runMiniAnalysis(env));
        }
      }
    } catch (error) {
      console.error('Scheduled analysis error:', error);
    }
  }
};

// GPT-4o-mini analysis (quick, frequent)
async function runMiniAnalysis(env) {
  try {
    // Gather current intelligence
    const [news, stocks, flights] = await Promise.all([
      getNews(env),
      getDefenseStocks(env),
      getMilitaryFlights(env)
    ]);

    const prompt = `You are a military intelligence analyst. Analyze the following real-time data and provide a threat assessment:

NEWS HEADLINES:
${JSON.stringify(news.articles?.slice(0, 20) || [], null, 2)}

DEFENSE CONTRACTOR STOCKS:
${JSON.stringify(stocks, null, 2)}

MILITARY FLIGHT ACTIVITY:
${JSON.stringify(flights, null, 2)}

Provide:
1. Overall threat level (0-100 scale)
2. Top 3 regions of concern
3. Probability of US military action in next 30 days (percentage)
4. Key indicators driving your assessment
5. Brief summary (2-3 sentences)

Format as JSON with keys: threatLevel, regions, probability, indicators, summary`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert military intelligence analyst specializing in predicting US military interventions based on multi-source intelligence.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    const analysis = JSON.parse(data.choices[0].message.content);

    latestAnalysis.mini = {
      ...analysis,
      timestamp: new Date().toISOString(),
      model: 'gpt-4o-mini'
    };
    latestAnalysis.lastMiniRun = new Date().toISOString();

    return latestAnalysis.mini;
  } catch (error) {
    console.error('Mini analysis error:', error);
    return { error: error.message };
  }
}

// GPT-4o deep analysis (comprehensive, less frequent)
async function runDeepAnalysis(env) {
  try {
    // Gather comprehensive intelligence
    const [news, stocks, flights, navy, reddit] = await Promise.all([
      getNews(env),
      getDefenseStocks(env),
      getMilitaryFlights(env),
      getNavyData(env),
      getRedditIntel(env)
    ]);

    const prompt = `You are a senior military intelligence analyst conducting a deep threat assessment. Analyze this comprehensive intelligence package:

NEWS & GEOPOLITICAL INTEL:
${JSON.stringify(news.articles?.slice(0, 30) || [], null, 2)}

DEFENSE INDUSTRY INDICATORS:
${JSON.stringify(stocks, null, 2)}

MILITARY AIR ACTIVITY:
${JSON.stringify(flights, null, 2)}

NAVAL MOVEMENTS:
${JSON.stringify(navy, null, 2)}

SOCIAL INTELLIGENCE (REDDIT):
${JSON.stringify(reddit, null, 2)}

Provide a COMPREHENSIVE assessment including:
1. Overall threat level (0-100 scale) with confidence interval
2. Detailed regional breakdown (Top 5 hotspots with individual scores)
3. Probability estimates for next 7, 30, and 90 days
4. Key indicators and their weight in your analysis
5. Historical context and pattern matching
6. Specific scenarios most likely to trigger intervention
7. Executive summary (3-4 paragraphs)
8. Recommended monitoring priorities

Format as JSON with keys: threatLevel, confidenceInterval, regions (array with name/score/reasoning), probabilities (7day/30day/90day), indicators, historicalContext, scenarios, executiveSummary, monitoringPriorities`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a senior military intelligence analyst with decades of experience predicting US military interventions. You combine geopolitical analysis, defense industry indicators, SIGINT, and open-source intelligence to provide accurate threat assessments.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    const analysis = JSON.parse(data.choices[0].message.content);

    latestAnalysis.deep = {
      ...analysis,
      timestamp: new Date().toISOString(),
      model: 'gpt-4o'
    };
    latestAnalysis.lastDeepRun = new Date().toISOString();

    return latestAnalysis.deep;
  } catch (error) {
    console.error('Deep analysis error:', error);
    return { error: error.message };
  }
}

// Calculate aggregated threat score from multiple sources
async function calculateThreatScore(env) {
  try {
    const [news, stocks] = await Promise.all([
      getNews(env),
      getDefenseStocks(env)
    ]);

    // Simple scoring algorithm
    let score = 50; // Baseline

    // News sentiment (placeholder - would need sentiment analysis)
    const militaryKeywords = ['strike', 'invasion', 'troops', 'deployment', 'conflict', 'war'];
    const newsScore = news.articles?.slice(0, 20).filter(article => 
      militaryKeywords.some(kw => article.title?.toLowerCase().includes(kw))
    ).length || 0;
    score += newsScore * 2;

    // Defense stocks trending up
    const avgStockChange = stocks.reduce((sum, s) => sum + (s.changePercent || 0), 0) / stocks.length;
    score += avgStockChange * 10;

    return {
      score: Math.min(100, Math.max(0, score)),
      timestamp: new Date().toISOString(),
      factors: {
        newsActivity: newsScore,
        defenseStocks: avgStockChange
      }
    };
  } catch (error) {
    return { error: error.message, score: 50 };
  }
}

// Get news from NewsAPI
async function getNews(env) {
  try {
    const keywords = 'military OR troops OR deployment OR strike OR conflict OR defense';
    const response = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(keywords)}&sortBy=publishedAt&language=en&pageSize=50`,
      {
        headers: { 'X-Api-Key': env.NEWS_API_KEY }
      }
    );
    return await response.json();
  } catch (error) {
    return { error: error.message, articles: [] };
  }
}

// Get defense contractor stock data
async function getDefenseStocks(env) {
  const symbols = ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'HII', 'LHX'];
  try {
    const stockPromises = symbols.map(symbol => getStockData(symbol, env));
    return await Promise.all(stockPromises);
  } catch (error) {
    return [];
  }
}

// Get individual stock data from Finnhub
async function getStockData(symbol, env) {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${env.FINNHUB_API_KEY}`
    );
    const data = await response.json();
    return {
      symbol,
      price: data.c,
      change: data.d,
      changePercent: data.dp,
      high: data.h,
      low: data.l,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return { symbol, error: error.message };
  }
}

// Get military flight data from OpenSky Network
async function getMilitaryFlights(env) {
  try {
    const response = await fetch('https://opensky-network.org/api/states/all');
    const data = await response.json();
    
    // Filter for military aircraft (ICAO addresses starting with specific ranges)
    const militaryFlights = data.states?.filter(state => {
      const icao = state[0];
      // US Military ICAO ranges (simplified)
      return icao && (
        icao.startsWith('AE') || // US Military
        icao.startsWith('15') || // USAF
        icao.startsWith('16')    // US Navy
      );
    }).map(state => ({
      icao: state[0],
      callsign: state[1]?.trim(),
      country: state[2],
      longitude: state[5],
      latitude: state[6],
      altitude: state[7],
      velocity: state[9],
      timestamp: state[3]
    })) || [];

    return {
      count: militaryFlights.length,
      flights: militaryFlights.slice(0, 50)
    };
  } catch (error) {
    return { error: error.message, count: 0, flights: [] };
  }
}

// Get navy vessel data (placeholder - would need actual marine tracking API)
async function getNavyData(env) {
  // This would integrate with marine traffic APIs
  return {
    message: 'Navy tracking requires marine traffic API integration',
    vessels: []
  };
}

// Get Reddit intelligence
async function getRedditIntel(env) {
  try {
    // Get OAuth token
    const authResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_SECRET}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    const authData = await authResponse.json();

    // Search for military-related posts
    const searchResponse = await fetch(
      'https://oauth.reddit.com/r/worldnews+geopolitics+military/search?q=military+OR+troops+OR+deployment&sort=new&limit=25',
      {
        headers: { 'Authorization': `Bearer ${authData.access_token}` }
      }
    );
    const data = await searchResponse.json();

    return {
      posts: data.data?.children?.map(post => ({
        title: post.data.title,
        score: post.data.score,
        comments: post.data.num_comments,
        subreddit: post.data.subreddit,
        created: post.data.created_utc,
        url: post.data.url
      })) || []
    };
  } catch (error) {
    return { error: error.message, posts: [] };
  }
}
