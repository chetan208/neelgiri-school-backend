import jwt from 'jsonwebtoken';

const generateToken = async(user) => {
    const token = await  jwt.sign({
                email: user.email, 
                id: user.id,
                role: user.role
            }, process.env.JWT_SECRET);
    return token;
}

export default generateToken;