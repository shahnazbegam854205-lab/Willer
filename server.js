const express = require('express');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve HTML file

// In-memory storage for agents (in production, use database)
const agents = new Map();

// API Keys
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// API 1: Chat with AI Agent
app.post('/api/chat', async (req, res) => {
    try {
        const { message, agentId } = req.body;
        
        // Get or create agent
        if (!agents.has(agentId)) {
            agents.set(agentId, {
                id: agentId,
                created: new Date(),
                conversation: [],
                websites: []
            });
        }
        
        const agent = agents.get(agentId);
        
        // Add to conversation history
        agent.conversation.push({
            role: 'user',
            content: message,
            timestamp: new Date()
        });
        
        // Determine if user wants to create website
        const wantsWebsite = message.toLowerCase().includes('create') || 
                            message.toLowerCase().includes('build') ||
                            message.toLowerCase().includes('make') ||
                            message.toLowerCase().includes('website') ||
                            message.toLowerCase().includes('site');
        
        if (wantsWebsite) {
            // Ask for clarification if needed
            if (message.length < 20) {
                agent.conversation.push({
                    role: 'assistant',
                    content: 'Please describe your website in more detail. What kind of website do you want?',
                    timestamp: new Date()
                });
                
                return res.json({
                    action: 'clarify',
                    response: 'Please describe your website in more detail. What kind of website do you want?'
                });
            }
            
            // Proceed to generate website
            agent.conversation.push({
                role: 'assistant',
                content: `Great! I'll create a website based on: "${message}". Generating now...`,
                timestamp: new Date()
            });
            
            return res.json({
                action: 'generate_website',
                response: `Great! I'll create a website based on: "${message}". Generating now...`
            });
        }
        
        // Regular chat response
        const aiResponse = await getAIResponse(message, agent.conversation);
        
        agent.conversation.push({
            role: 'assistant',
            content: aiResponse,
            timestamp: new Date()
        });
        
        res.json({
            action: 'chat',
            response: aiResponse
        });
        
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Chat failed',
            message: error.message
        });
    }
});

// API 2: Generate and Deploy Website
app.post('/api/generate-website', async (req, res) => {
    console.log('🌐 Generating website...');
    
    try {
        const { description, agentId } = req.body;
        
        if (!description || description.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Please provide detailed description'
            });
        }
        
        // Step 1: Generate code with AI
        console.log('🔧 Step 1: AI code generation');
        const websiteCode = await generateWebsiteCode(description);
        
        // Step 2: Create GitHub repository
        console.log('💾 Step 2: Creating GitHub repo');
        const githubRepo = await createGitHubRepository(websiteCode, agentId);
        
        // Step 3: Deploy to Vercel
        console.log('🚀 Step 3: Deploying to Vercel');
        const vercelUrl = await deployToVercel(githubRepo.fullName);
        
        console.log('✅ Website created successfully');
        
        // Update agent data
        if (agents.has(agentId)) {
            const agent = agents.get(agentId);
            agent.websites.push({
                url: vercelUrl,
                github: githubRepo.url,
                description: description,
                created: new Date()
            });
        }
        
        res.json({
            success: true,
            url: vercelUrl,
            github: githubRepo.url,
            message: 'Website created and deployed!',
            agentId: agentId
        });
        
    } catch (error) {
        console.error('Generate error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Function: Get AI Response
async function getAIResponse(message, conversation) {
    try {
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: 'deepseek-coder',
            messages: [
                {
                    role: 'system',
                    content: `You are an AI website builder agent. Help users create websites through chat.
                    Your responses should be friendly and helpful.
                    If user wants to create a website, ask for details.
                    Keep responses concise and mobile-friendly.`
                },
                ...conversation.slice(-5).map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            ],
            temperature: 0.7,
            max_tokens: 500
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data.choices[0].message.content;
        
    } catch (error) {
        console.error('AI response error:', error);
        return "I'm your website building assistant. How can I help you create a website today?";
    }
}

// Function: Generate Website Code
async function generateWebsiteCode(description) {
    try {
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: 'deepseek-coder',
            messages: [{
                role: 'system',
                content: `Generate mobile-optimized website code. Requirements:
                1. Modern, professional design
                2. Fully responsive for mobile
                3. Fast loading
                4. Clean, semantic HTML
                5. Include meta tags for SEO
                6. Dark/Light theme toggle
                7. Return as JSON: {html: "", css: "", js: ""}`
            }, {
                role: 'user',
                content: `Create a website: ${description}`
            }],
            temperature: 0.7,
            max_tokens: 4000,
            response_format: { type: "json_object" }
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        return JSON.parse(response.data.choices[0].message.content);
        
    } catch (error) {
        console.error('Code generation error:', error);
        // Fallback template
        return {
            html: createFallbackHTML(description),
            css: createFallbackCSS(),
            js: createFallbackJS()
        };
    }
}

// Fallback HTML template
function createFallbackHTML(description) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${description.substring(0, 50)}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>Welcome to Your Website</h1>
            <p>Created with AI Website Factory</p>
        </header>
        <main>
            <section class="hero">
                <h2>${description}</h2>
                <p>This website was generated automatically.</p>
            </section>
        </main>
        <footer>
            <p>Managed by AI Agent</p>
        </footer>
    </div>
    <script src="script.js"></script>
</body>
</html>`;
}

function createFallbackCSS() {
    return `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui; background: #0f172a; color: white; }
.container { max-width: 1200px; margin: 0 auto; padding: 20px; }`;
}

function createFallbackJS() {
    return `console.log('Website loaded');`;
}

// Function: Create GitHub Repository
async function createGitHubRepository(code, agentId) {
    try {
        const octokit = new Octokit({ auth: GITHUB_TOKEN });
        const repoName = `website-${agentId}-${Date.now()}`;
        
        // Create repository
        const repo = await octokit.repos.createForAuthenticatedUser({
            name: repoName,
            description: `AI Generated Website - Agent: ${agentId}`,
            private: false,
            auto_init: false
        });
        
        // Create files
        await octokit.repos.createOrUpdateFileContents({
            owner: repo.data.owner.login,
            repo: repo.data.name,
            path: 'index.html',
            message: 'Add HTML',
            content: Buffer.from(code.html).toString('base64')
        });
        
        await octokit.repos.createOrUpdateFileContents({
            owner: repo.data.owner.login,
            repo: repo.data.name,
            path: 'style.css',
            message: 'Add CSS',
            content: Buffer.from(code.css).toString('base64')
        });
        
        await octokit.repos.createOrUpdateFileContents({
            owner: repo.data.owner.login,
            repo: repo.data.name,
            path: 'script.js',
            message: 'Add JS',
            content: Buffer.from(code.js).toString('base64')
        });
        
        return {
            url: repo.data.html_url,
            fullName: repo.data.full_name
        };
        
    } catch (error) {
        console.error('GitHub error:', error);
        throw new Error('Failed to create GitHub repository');
    }
}

// Function: Deploy to Vercel
async function deployToVercel(repoFullName) {
    try {
        const response = await axios.post('https://api.vercel.com/v13/deployments', {
            name: repoFullName.split('/')[1],
            gitSource: {
                type: 'github',
                repo: repoFullName,
                ref: 'main'
            },
            target: 'production'
        }, {
            headers: {
                'Authorization': `Bearer ${VERCEL_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        return `https://${response.data.url}`;
        
    } catch (error) {
        console.error('Vercel error:', error);
        throw new Error('Failed to deploy to Vercel');
    }
}

// API: Get agent info
app.get('/api/agent/:agentId', (req, res) => {
    const agent = agents.get(req.params.agentId);
    if (agent) {
        res.json({
            success: true,
            agent: {
                id: agent.id,
                created: agent.created,
                websiteCount: agent.websites.length,
                websites: agent.websites
            }
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Agent not found'
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        agents: agents.size,
        timestamp: new Date().toISOString()
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    🚀 AI WEBSITE FACTORY SERVER
    ============================
    🔗 Local: http://localhost:${PORT}
    📱 Mobile: Open in browser
    
    📋 Features:
    • Terms & Conditions First
    • AI Chat Agent per User
    • Auto Vercel Deployment
    • Mobile Optimized
    
    ⚠️  Add API keys to .env file
    ============================
    `);
});
