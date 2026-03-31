import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import { SitemapStream, streamToPromise } from "sitemap";
import { Readable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/recommendation", async (req, res) => {
    const { name, email, recommend } = req.body;
    
    console.log("--- New Recommendation Received ---");
    console.log(`From: ${name} (${email})`);
    console.log(`Recommendation: ${recommend}`);
    console.log("-----------------------------------");

    // Check if SMTP is configured
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

    // Basic validation for SMTP configuration
    const isConfigured = SMTP_HOST && SMTP_HOST.length > 2 && SMTP_PORT && SMTP_USER && SMTP_PASS;

    if (!isConfigured) {
      console.error("SMTP is not fully or correctly configured. Host:", SMTP_HOST);
      return res.status(400).json({ 
        success: false, 
        message: "SMTP configuration is invalid or missing. Falling back to mailto: link.",
        fallback: true
      });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT),
        secure: parseInt(SMTP_PORT) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
        // Add a timeout to prevent long-hanging requests on DNS failure
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
      });

      // Verify connection configuration
      try {
        await transporter.verify();
      } catch (verifyError) {
        console.error("SMTP Verification failed:", verifyError);
        return res.status(400).json({
          success: false,
          message: "Could not connect to SMTP server. Falling back to mailto: link.",
          fallback: true
        });
      }

      const mailOptions = {
        from: SMTP_FROM || SMTP_USER,
        to: "snsb767@gmail.com",
        subject: `mednotes Recommendation from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\nRecommendation:\n${recommend}`,
        html: `
          <h3>New Recommendation for mednotes</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Recommendation:</strong></p>
          <p>${recommend.replace(/\n/g, '<br>')}</p>
        `,
      };

      let attempts = 0;
      const maxAttempts = 3;

      const sendEmail = async () => {
        try {
          await transporter.sendMail(mailOptions);
          console.log("Email sent successfully!");
          res.json({ 
            success: true, 
            message: "Recommendation sent! Thank you for your feedback." 
          });
        } catch (err) {
          attempts++;
          if (attempts < maxAttempts) {
            console.log(`Retrying email send (attempt ${attempts + 1})...`);
            setTimeout(sendEmail, 3000);
          } else {
            console.error("Max email retry attempts reached:", err);
            res.status(500).json({ 
              success: false, 
              message: "Failed to send email after multiple attempts. Falling back to mailto: link.",
              fallback: true
            });
          }
        }
      };

      await sendEmail();
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to send email. Falling back to mailto: link.",
        fallback: true
      });
    }
  });

  // Sitemap route
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const smStream = new SitemapStream({
        hostname: process.env.APP_URL || `http://${req.headers.host}`,
      });

      // List of your routes
      const links = [
        { url: "/", changefreq: "daily", priority: 1.0 },
        // Add more routes here as your app grows
      ];

      const sitemapOutput = await streamToPromise(Readable.from(links).pipe(smStream));
      
      res.header("Content-Type", "application/xml");
      res.send(sitemapOutput);
    } catch (e) {
      console.error(e);
      res.status(500).end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
