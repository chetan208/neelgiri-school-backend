import jwt from "jsonwebtoken";

const checkAuthMiddleware = (req, res, next) => {
    try {
        
        const token = req.cookies.token;
        

        if(!token){
            return res.status(401).json({message: "Unauthorized"});
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.log("error in auth middleware",error);
        res.status(401).json({message: "Unauthorized"});
    }
}

const checkAdminMiddleware = (req, res, next) => {
    try {
        const token = req.cookies.token;
        if(!token){
            console.log("No token found in request cookies");
            return res.status(401).json({message: "Unauthorized"});
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if(decoded.role !== "Admin" && decoded.role !== "Owner"){
            return res.status(403).json({message: "Forbidden"});
        }
        req.user = decoded;
        next();
        
    } catch (error) {
        console.log("error in admin middleware",error);
        res.status(401).json({message: "Unauthorized"});

    }
}

const checkOwnerMiddleware = (req, res, next) => {
    try {
        const token = req.cookies.token;
        if(!token){
            return res.status(401).json({message: "Unauthorized"});
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if(decoded.role !== "Owner"){
            return res.status(403).json({message: "Forbidden"});
        }
        req.user = decoded;
        next();
        
    } catch (error) {
        console.log("error in owner middleware",error);
        res.status(401).json({message: "Unauthorized"});
    }
}

export {checkAuthMiddleware, checkAdminMiddleware, checkOwnerMiddleware}