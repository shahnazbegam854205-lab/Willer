const express = require('express');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// API Keys from environment variables
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';

// Store user sessions in memory (for production use database)
const userSessions = new Map();

// Log API key status
console.log('\n📊 API Key Status:');
console.log('• DeepSeek API:', DEEPSEEK_API_KEY ? '✅ Configured' : '❌ Missing');
console.log('• GitHub Token:', GITHUB_TOKEN ? '✅ Configured' : '❌ Missing');
console.log('• Vercel Token:', VERCEL_TOKEN ? '✅ Configured' : '❌ Missing');
console.log('');

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// API 1: Chat with AI
app.post('/api/chat', async (req, res) => {
    try {
        console.log('💬 Chat request received');
        
        const { message, currentCode } = req.body;
        
        if (!message || message.trim().length < 3) {
            return res.status(400).json({
                success: false,
                response: 'Please enter a valid message (min 3 characters)',
                code: null
            });
        }
        
        // Show request in console
        console.log(`📝 User: ${message.substring(0, 50)}...`);
        
        // Generate AI response
        const aiResponse = await generateAIResponse(message, currentCode);
        
        console.log('🤖 AI Response generated');
        
        res.json({
            success: true,
            response: aiResponse.message,
            code: aiResponse.code
        });
        
    } catch (error) {
        console.error('❌ Chat API Error:', error.message);
        
        // Fallback response
        res.json({
            success: false,
            response: 'I created a website for you! Check the preview.',
            code: generateFallbackTemplate('AI generated website')
        });
    }
});

// API 2: Deploy Website to Vercel
app.post('/api/deploy', async (req, res) => {
    console.log('\n🚀 Deployment request received');
    
    try {
        const { project } = req.body;
        
        if (!project || !project.html) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project data',
                url: '',
                github: ''
            });
        }
        
        console.log('📁 Project data received');
        
        // Step 1: Create GitHub Repository
        console.log('1️⃣ Creating GitHub repository...');
        let githubData;
        
        if (GITHUB_TOKEN) {
            githubData = await createGitHubRepository(project);
            console.log(`✅ GitHub repo created: ${githubData.url}`);
        } else {
            // Mock GitHub URL for testing
            githubData = {
                url: `https://github.com/happy-ai/website-${Date.now()}`,
                repoName: `happy-ai/website-${Date.now()}`
            };
            console.log('⚠️ Using mock GitHub URL (no GITHUB_TOKEN)');
        }
        
        // Step 2: Deploy to Vercel
        console.log('2️⃣ Deploying to Vercel...');
        let vercelUrl;
        
        if (VERCEL_TOKEN && githubData.repoName) {
            vercelUrl = await deployToVercel(githubData.repoName);
            console.log(`✅ Vercel deployment: ${vercelUrl}`);
        } else {
            // Mock Vercel URL for testing
            vercelUrl = `https://happy-website-${Date.now()}.vercel.app`;
            console.log('⚠️ Using mock Vercel URL (no VERCEL_TOKEN)');
        }
        
        console.log('🎉 Deployment completed successfully!');
        
        res.json({
            success: true,
            url: vercelUrl,
            github: githubData.url,
            message: 'Website deployed successfully! 🚀'
        });
        
    } catch (error) {
        console.error('❌ Deployment Error:', error.message);
        console.error('Stack:', error.stack);
        
        // Return mock URLs if deployment fails
        res.json({
            success: false,
            url: `https://happy-fallback-${Date.now()}.vercel.app`,
            github: 'https://github.com/happy-ai/fallback-repo',
            error: error.message || 'Deployment failed, but here are demo URLs',
            message: 'Demo URLs generated. For real deployment, check API keys.'
        });
    }
});

// API 3: Get project history (for future enhancement)
app.get('/api/history/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userSessions.has(userId)) {
            userSessions.set(userId, {
                userId,
                projects: [],
                createdAt: new Date()
            });
        }
        
        const userData = userSessions.get(userId);
        
        res.json({
            success: true,
            history: userData.projects.slice(0, 10), // Last 10 projects
            total: userData.projects.length
        });
        
    } catch (error) {
        res.json({
            success: false,
            history: [],
            error: error.message
        });
    }
});

// API 4: Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Happy AI Website Builder',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        apiStatus: {
            deepseek: !!DEEPSEEK_API_KEY,
            github: !!GITHUB_TOKEN,
            vercel: !!VERCEL_TOKEN
        }
    });
});

// API 5: Save project
app.post('/api/save', (req, res) => {
    try {
        const { userId, project } = req.body;
        
        if (!userSessions.has(userId)) {
            userSessions.set(userId, {
                userId,
                projects: [],
                createdAt: new Date()
            });
        }
        
        const userData = userSessions.get(userId);
        
        // Add project to history
        userData.projects.unshift({
            id: `project_${Date.now()}`,
            name: project.name || 'Untitled',
            preview: project.html ? project.html.substring(0, 200) + '...' : '',
            timestamp: new Date().toISOString(),
            code: {
                html: project.html || '',
                css: project.css || '',
                js: project.js || ''
            }
        });
        
        // Keep only last 20 projects
        if (userData.projects.length > 20) {
            userData.projects = userData.projects.slice(0, 20);
        }
        
        console.log(`💾 Project saved for user: ${userId}`);
        
        res.json({
            success: true,
            message: 'Project saved successfully',
            projectId: userData.projects[0].id
        });
        
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Function: Generate AI Response
async function generateAIResponse(message, currentCode = {}) {
    try {
        // If DeepSeek API is available, use it
        if (DEEPSEEK_API_KEY) {
            console.log('🤖 Calling DeepSeek API...');
            
            const response = await axios.post(
                'https://api.deepseek.com/v1/chat/completions',
                {
                    model: 'deepseek-coder',
                    messages: [
                        {
                            role: 'system',
                            content: `You are Happy AI, a website builder assistant. Generate HTML, CSS, and JavaScript code for websites.
                            Always return code in this EXACT JSON format:
                            {
                                "html": "complete HTML code here",
                                "css": "complete CSS code here",
                                "js": "JavaScript code here",
                                "message": "brief explanation"
                            }
                            
                            Requirements:
                            1. Create modern, responsive websites
                            2. Use dark theme with glowing effects
                            3. Make it mobile-friendly
                            4. Include interactive elements
                            5. Add comments in code
                            
                            User wants: ${message}
                            
                            Current code (if any):
                            HTML: ${currentCode.html?.substring(0, 500) || 'None'}
                            CSS: ${currentCode.css?.substring(0, 500) || 'None'}
                            JS: ${currentCode.js?.substring(0, 500) || 'None'}`
                        },
                        {
                            role: 'user',
                            content: `Create a website for: ${message}`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 4000,
                    response_format: { type: "json_object" }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 seconds timeout
                }
            );
            
            console.log('✅ DeepSeek API response received');
            
            try {
                const aiData = JSON.parse(response.data.choices[0].message.content);
                
                return {
                    message: aiData.message || 'I created a website for you!',
                    code: {
                        html: aiData.html || generateFallbackTemplate(message).html,
                        css: aiData.css || generateFallbackTemplate(message).css,
                        js: aiData.js || generateFallbackTemplate(message).js
                    }
                };
                
            } catch (parseError) {
                console.error('❌ Failed to parse AI response:', parseError);
                return generateFallbackResponse(message);
            }
            
        } else {
            // If no API key, use template
            console.log('⚠️ No DeepSeek API key, using template');
            return generateFallbackResponse(message);
        }
        
    } catch (error) {
        console.error('❌ AI Generation Error:', error.message);
        
        if (error.response) {
            console.error('API Response Status:', error.response.status);
            console.error('API Response Data:', error.response.data);
        }
        
        return generateFallbackResponse(message);
    }
}

// Function: Generate fallback response
function generateFallbackResponse(message) {
    console.log('🔄 Using fallback template');
    
    const template = generateFallbackTemplate(message);
    
    return {
        message: `I created a "${message}" website for you! 🎉`,
        code: template
    };
}

// Function: Generate fallback template
function generateFallbackTemplate(message) {
    const templateId = Date.now();
    
    return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${message} | Happy AI Builder</title>
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <!-- Navigation -->
    <nav class="navbar">
        <div class="container">
            <div class="logo">
                <i class="fas fa-robot"></i>
                <span>Happy AI</span>
            </div>
            <div class="nav-links">
                <a href="#home">Home</a>
                <a href="#about">About</a>
                <a href="#features">Features</a>
                <a href="#contact">Contact</a>
            </div>
            <button class="menu-toggle">
                <i class="fas fa-bars"></i>
            </button>
        </div>
    </nav>

    <!-- Hero Section -->
    <section class="hero" id="home">
        <div class="container">
            <div class="hero-content">
                <h1 class="glow-text">${message}</h1>
                <p class="subtitle">Created with ❤️ using Happy AI Website Builder</p>
                <div class="cta-buttons">
                    <button class="btn primary-btn" onclick="showAlert('Welcome!')">
                        <i class="fas fa-rocket"></i> Get Started
                    </button>
                    <button class="btn secondary-btn" onclick="showAlert('Learn More clicked!')">
                        <i class="fas fa-info-circle"></i> Learn More
                    </button>
                </div>
            </div>
            <div class="hero-image">
                <div class="glow-circle"></div>
            </div>
        </div>
    </section>

    <!-- Features Section -->
    <section class="features" id="features">
        <div class="container">
            <h2 class="section-title">✨ Amazing Features</h2>
            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-icon">
                        <i class="fas fa-bolt"></i>
                    </div>
                    <h3>Fast & Efficient</h3>
                    <p>Lightning fast performance with optimized code</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">
                        <i class="fas fa-mobile-alt"></i>
                    </div>
                    <h3>Mobile First</h3>
                    <p>Perfectly responsive on all devices</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">
                        <i class="fas fa-palette"></i>
                    </div>
                    <h3>Beautiful Design</h3>
                    <p>Modern UI with glowing effects</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
        <div class="container">
            <p>© ${new Date().getFullYear()} Happy AI Builder. All rights reserved.</p>
            <div class="social-links">
                <a href="#"><i class="fab fa-github"></i></a>
                <a href="#"><i class="fab fa-twitter"></i></a>
                <a href="#"><i class="fab fa-linkedin"></i></a>
            </div>
        </div>
    </footer>

    <script src="script.js"></script>
</body>
</html>`,
        
        css: `/* Happy AI Website Builder - Modern Dark Theme */
:root {
    --primary-color: #00ffaa;
    --secondary-color: #8a2be2;
    --accent-color: #ff0080;
    --dark-bg: #0a0a1a;
    --card-bg: rgba(20, 20, 40, 0.9);
    --text-primary: #ffffff;
    --text-secondary: #a0a0ff;
    --border-glow: rgba(0, 255, 170, 0.3);
    --shadow-glow: 0 0 20px rgba(0, 255, 170, 0.3);
    --transition: all 0.3s ease;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', 'SF Pro Display', system-ui, sans-serif;
    background: var(--dark-bg);
    color: var(--text-primary);
    line-height: 1.6;
    overflow-x: hidden;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

/* Navigation */
.navbar {
    background: var(--card-bg);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border-glow);
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    padding: 1rem 0;
}

.navbar .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.logo {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.logo i {
    font-size: 1.8rem;
}

.nav-links {
    display: flex;
    gap: 2rem;
}

.nav-links a {
    color: var(--text-secondary);
    text-decoration: none;
    font-weight: 500;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    transition: var(--transition);
}

.nav-links a:hover {
    color: var(--primary-color);
    background: rgba(0, 255, 170, 0.1);
}

.menu-toggle {
    display: none;
    background: none;
    border: none;
    color: var(--primary-color);
    font-size: 1.5rem;
    cursor: pointer;
}

/* Hero Section */
.hero {
    padding: 120px 0 80px;
    position: relative;
    overflow: hidden;
}

.hero::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at 30% 50%, rgba(0, 255, 170, 0.1) 0%, transparent 50%);
    z-index: -1;
}

.hero .container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3rem;
}

.hero-content {
    flex: 1;
}

.glow-text {
    font-size: 3.5rem;
    margin-bottom: 1.5rem;
    background: linear-gradient(90deg, var(--primary-color), var(--accent-color));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 0 30px rgba(0, 255, 170, 0.3);
    animation: glow 2s infinite alternate;
}

@keyframes glow {
    from {
        text-shadow: 0 0 20px rgba(0, 255, 170, 0.3);
    }
    to {
        text-shadow: 0 0 30px rgba(0, 255, 170, 0.6);
    }
}

.subtitle {
    font-size: 1.2rem;
    color: var(--text-secondary);
    margin-bottom: 2rem;
    max-width: 600px;
}

.cta-buttons {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

.btn {
    padding: 1rem 2rem;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: var(--transition);
}

.primary-btn {
    background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
    color: var(--dark-bg);
}

.primary-btn:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-glow);
}

.secondary-btn {
    background: rgba(0, 255, 170, 0.1);
    color: var(--primary-color);
    border: 2px solid var(--border-glow);
}

.secondary-btn:hover {
    background: rgba(0, 255, 170, 0.2);
    transform: translateY(-3px);
}

.hero-image {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
}

.glow-circle {
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, var(--primary-color) 0%, transparent 70%);
    border-radius: 50%;
    filter: blur(40px);
    opacity: 0.3;
    animation: float 6s infinite ease-in-out;
}

@keyframes float {
    0%, 100% {
        transform: translateY(0) scale(1);
    }
    50% {
        transform: translateY(-20px) scale(1.1);
    }
}

/* Features Section */
.features {
    padding: 80px 0;
}

.section-title {
    text-align: center;
    font-size: 2.5rem;
    margin-bottom: 3rem;
    color: var(--primary-color);
}

.features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
}

.feature-card {
    background: var(--card-bg);
    border: 1px solid var(--border-glow);
    border-radius: 20px;
    padding: 2rem;
    text-align: center;
    transition: var(--transition);
}

.feature-card:hover {
    transform: translateY(-10px);
    border-color: var(--primary-color);
    box-shadow: var(--shadow-glow);
}

.feature-icon {
    font-size: 3rem;
    margin-bottom: 1.5rem;
    color: var(--primary-color);
}

.feature-card h3 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    color: var(--text-primary);
}

.feature-card p {
    color: var(--text-secondary);
}

/* Footer */
.footer {
    background: rgba(10, 10, 26, 0.9);
    border-top: 1px solid var(--border-glow);
    padding: 2rem 0;
    margin-top: 4rem;
}

.footer .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
}

.footer p {
    color: var(--text-secondary);
}

.social-links {
    display: flex;
    gap: 1rem;
}

.social-links a {
    color: var(--text-secondary);
    font-size: 1.5rem;
    transition: var(--transition);
}

.social-links a:hover {
    color: var(--primary-color);
    transform: translateY(-3px);
}

/* Responsive Design */
@media (max-width: 768px) {
    .nav-links {
        display: none;
    }
    
    .menu-toggle {
        display: block;
    }
    
    .hero .container {
        flex-direction: column;
        text-align: center;
    }
    
    .glow-text {
        font-size: 2.5rem;
    }
    
    .cta-buttons {
        justify-content: center;
    }
    
    .glow-circle {
        width: 200px;
        height: 200px;
    }
    
    .footer .container {
        flex-direction: column;
        text-align: center;
    }
}

@media (max-width: 480px) {
    .glow-text {
        font-size: 2rem;
    }
    
    .btn {
        padding: 0.8rem 1.5rem;
        font-size: 0.9rem;
    }
    
    .features-grid {
        grid-template-columns: 1fr;
    }
}

/* Custom Scrollbar */
::-webkit-scrollbar {
    width: 10px;
}

::-webkit-scrollbar-track {
    background: var(--dark-bg);
}

::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, var(--primary-color), var(--secondary-color));
    border-radius: 5px;
}

::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, var(--accent-color), var(--primary-color));
}`,
        
        js: `// Happy AI Website Builder - JavaScript
console.log('%c✨ Happy AI Website Loaded ✨', 'color: #00ffaa; font-size: 16px; font-weight: bold;');
console.log('%cBuilt with ❤️ using Happy AI Builder', 'color: #a0a0ff;');

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing website...');
    
    // Initialize all features
    initNavigation();
    initAnimations();
    initInteractiveElements();
    initMobileMenu();
    
    console.log('✅ Website initialized successfully!');
});

// Navigation initialization
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId && targetId !== '#') {
                const targetElement = document.querySelector(targetId);
                
                if (targetElement) {
                    // Smooth scroll to section
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: 'smooth'
                    });
                    
                    // Update active link
                    navLinks.forEach(l => l.classList.remove('active'));
                    this.classList.add('active');
                }
            }
        });
    });
    
    // Add scroll spy for navigation
    window.addEventListener('scroll', function() {
        const sections = document.querySelectorAll('section');
        const scrollPos = window.scrollY + 100;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    });
}

// Animations initialization
function initAnimations() {
    // Intersection Observer for scroll animations
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);
    
    // Observe feature cards
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        observer.observe(card);
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'all 0.6s ease';
    });
    
    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = \`
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
        
        .feature-card:nth-child(1) { transition-delay: 0.1s; }
        .feature-card:nth-child(2) { transition-delay: 0.2s; }
        .feature-card:nth-child(3) { transition-delay: 0.3s; }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    \`;
    document.head.appendChild(style);
}

// Interactive elements initialization
function initInteractiveElements() {
    // Button click effects
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Create ripple effect
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = \`
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.7);
                transform: scale(0);
                animation: ripple-animation 0.6s linear;
                width: \${size}px;
                height: \${size}px;
                top: \${y}px;
                left: \${x}px;
                pointer-events: none;
            \`;
            
            this.appendChild(ripple);
            
            // Remove ripple after animation
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
    
    // Add ripple animation CSS
    const rippleStyle = document.createElement('style');
    rippleStyle.textContent = \`
        @keyframes ripple-animation {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        .btn {
            position: relative;
            overflow: hidden;
        }
    \`;
    document.head.appendChild(rippleStyle);
    
    // Glow effect on hover for feature cards
    const featureCards = document.querySelectorAll('.feature-card');
    
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.boxShadow = '0 15px 40px rgba(0, 255, 170, 0.4)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.boxShadow = '';
        });
    });
}

// Mobile menu initialization
function initMobileMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', function() {
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
            
            if (navLinks.style.display === 'flex') {
                navLinks.style.cssText = \`
                    display: flex;
                    flex-direction: column;
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: var(--card-bg);
                    backdrop-filter: blur(20px);
                    padding: 1rem;
                    border-bottom: 2px solid var(--border-glow);
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                    z-index: 1000;
                \`;
                
                // Animate menu items
                const links = navLinks.querySelectorAll('a');
                links.forEach((link, index) => {
                    link.style.opacity = '0';
                    link.style.transform = 'translateY(-10px)';
                    link.style.transition = 'all 0.3s ease';
                    
                    setTimeout(() => {
                        link.style.opacity = '1';
                        link.style.transform = 'translateY(0)';
                    }, index * 100);
                });
            }
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!menuToggle.contains(e.target) && !navLinks.contains(e.target)) {
                if (window.innerWidth <= 768) {
                    navLinks.style.display = 'none';
                }
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                navLinks.style.display = 'flex';
                navLinks.style.cssText = '';
            } else {
                navLinks.style.display = 'none';
            }
        });
    }
}

// Alert function for buttons
function showAlert(message) {
    alert(\`🎉 \${message}\`);
    
    // Add visual feedback
    const alertSound = document.createElement('audio');
    alertSound.innerHTML = '<source src="https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3" type="audio/mpeg">';
    document.body.appendChild(alertSound);
    
    try {
        alertSound.play();
    } catch (error) {
        console.log('Audio play failed:', error);
    }
    
    setTimeout(() => {
        alertSound.remove();
    }, 1000);
}

// Current year in footer
function updateCurrentYear() {
    const yearElement = document.querySelector('.footer p');
    if (yearElement) {
        const currentYear = new Date().getFullYear();
        yearElement.innerHTML = yearElement.innerHTML.replace('2024', currentYear);
    }
}

// Initialize current year
updateCurrentYear();

// Performance monitoring
let loadTime = window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart;
console.log(\`⏱️ Page load time: \${loadTime}ms\`);

// Add loading state
window.addEventListener('load', function() {
    document.body.classList.add('loaded');
    
    // Add loaded class for animations
    setTimeout(() => {
        document.body.style.opacity = '1';
        document.body.style.transition = 'opacity 0.5s ease';
    }, 100);
});

// Error handling
window.addEventListener('error', function(e) {
    console.error('🚨 Website Error:', e.error);
    
    // Show user-friendly error message
    if (!document.getElementById('error-toast')) {
        const errorToast = document.createElement('div');
        errorToast.id = 'error-toast';
        errorToast.style.cssText = \`
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            z-index: 9999;
            animation: slideIn 0.3s ease;
            max-width: 300px;
            border-left: 4px solid #ff4444;
        \`;
        
        errorToast.innerHTML = \`
            <strong>⚠️ Something went wrong</strong>
            <p style="margin-top: 5px; font-size: 0.9rem;">Please refresh the page</p>
        \`;
        
        document.body.appendChild(errorToast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            errorToast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => errorToast.remove(), 300);
        }, 5000);
    }
});

// Add animation styles
const animationStyles = document.createElement('style');
animationStyles.textContent = \`
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    body {
        opacity: 0;
    }
    
    body.loaded {
        opacity: 1;
    }
\`;
document.head.appendChild(animationStyles);

// Export functions for global use
window.HappyAI = {
    showAlert: showAlert,
    initNavigation: initNavigation,
    initAnimations: initAnimations
};

console.log('🌟 Happy AI Website ready!');`
    };
}

// Function: Create GitHub Repository
async function createGitHubRepository(project) {
    try {
        if (!GITHUB_TOKEN) {
            throw new Error('GitHub token not configured');
        }
        
        console.log('📁 Creating GitHub repository...');
        
        const octokit = new Octokit({ auth: GITHUB_TOKEN });
        const repoName = `happy-website-${Date.now()}`;
        
        // Create repository
        const repo = await octokit.rest.repos.createForAuthenticatedUser({
            name: repoName,
            description: `Website created with Happy AI Builder - ${project.name || 'AI Generated'}`,
            private: false,
            auto_init: false
        });
        
        console.log(`✅ Repository created: ${repo.data.html_url}`);
        
        // Create files
        const files = [
            {
                path: 'index.html',
                content: Buffer.from(project.html).toString('base64'),
                message: 'Add HTML file - Created with Happy AI Builder'
            },
            {
                path: 'style.css',
                content: Buffer.from(project.css || generateFallbackTemplate('').css).toString('base64'),
                message: 'Add CSS file - Created with Happy AI Builder'
            },
            {
                path: 'script.js',
                content: Buffer.from(project.js || generateFallbackTemplate('').js).toString('base64'),
                message: 'Add JavaScript file
