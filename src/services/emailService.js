import { Resend } from 'resend';

// Initialize Resend using your environment variable
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOtpEmail(toEmail, otp) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'NPS Verification<no-reply@neelgiripublicschool.in>', 
      to: [toEmail], // Dynamic receiver ID passed as parameter
      subject: 'Your One-Time Password (OTP) Verification Code',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Verification Code</h2>
          <p>Hello,</p>
          <p>Your one-time password for verification is:</p>
          <div style="background-color: #f4f4f4; padding: 15px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; border-radius: 4px; width: fit-content; margin: 10px 0;">
            ${otp}
          </div>
          <p>This code is valid for a limited time. Please do not share this OTP with anyone.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;" />
          <p style="font-size: 12px; color: #777;">Neelgiri Public School</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend API Error:', error);
      throw new Error(error.message || 'Failed to send OTP email.');
    }

    return data;
  } catch (err) {
    console.error('Error in sendOtpEmail service:', err);
    throw err;
  }
}

async function sendContectUsEmail(sender,phoneNumber,email,message){
 try {
    const { data, error } = await resend.emails.send({
      from: 'Contact Us<no-reply@neelgiripublicschool.in>', 
      to: 'chetanchoudhary435@gmail.com',
      subject: `New Contact Us Message from ${sender}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>New Contact Us Message</h2>
          <p><strong>From:</strong> ${sender}</p>
          <p><strong>Phone Number:</strong> ${phoneNumber}</p>
          <p><strong>Email:</strong> ${email}</p> 
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend API Error:', error);
      throw new Error(error.message || 'Failed to send Contact Us email.');
    }

    return data;
 } catch (error) {
   return error
  
 }
}


export { sendOtpEmail, sendContectUsEmail };