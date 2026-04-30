const nodemailer = require('nodemailer');
require('dotenv').config();

async function testMail() {
  try {
    console.log('Host:', process.env.EMAIL_HOST);
    console.log('Port:', process.env.EMAIL_PORT);
    console.log('User:', process.env.EMAIL_USER);
    // console.log('Pass:', process.env.EMAIL_PASS); // don't log password

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_PORT == 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"Vehicle Emergency Alert" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `🚨 EMERGENCY ALERT TEST`,
      html: `<h2>🚨 Vehicle Emergency Alert Test</h2>`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Emergency email sent successfully!', info.response);
  } catch (err) {
    console.error('Failed to send email:', err);
  }
}

testMail();
