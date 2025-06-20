const express = require("express");
const cors = require("cors");
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path'); 




require('dotenv').config();
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = 5000;

const genAI = new GoogleGenerativeAI(process.env.API_KEY); 
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const fileManager = new GoogleAIFileManager(process.env.API_KEY);
// Store user chat sessions and histories
const usersesions = {};
const storage =multer.diskStorage({
  destination:function(req,file,cb){
    cb(null,'uploads');
  },
  filename: function(req,file,cb){
    cb(null,uuidv4()+"-"+Date.now()+path.extname(file.originalname));
  }
});


const fileFilter =(req,file,cb)=>{
  const allowedFileTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];  
  if(allowedFileTypes.includes(file.mimetype)){
    cb(null,true);
  }else{
    cb(null,false);
  }
}


const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain"
};


async function uploadToGemini(path, mimeType) {
  const uploadResult = await fileManager.uploadFile(path, {
    mimeType,
    displayName: path,
  });
  const file = uploadResult.file;
  console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
  return file;
}



// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const uploadMiddleware = multer({ storage: storage, fileFilter: fileFilter });



// API Endpoint to handle POST data
app.post("/",uploadMiddleware.fields([{ name: 'file', maxCount: 1 },]), async (req, res) => {
  const { userId, prompt } = req.body;
  const File = req.files && req.files['file'] ? req.files['file'][0] : null;
  console.log("Received prompt:", prompt, "for user:", userId);

  if (!usersesions[userId]) {
        usersesions[userId] = {
        chatSession: model.startChat({ history: [] }),
        history: []
        };
  }
  const userSession = usersesions[userId];   

  try {
    userSession.history.push({ sender: 'user', message: prompt });
    if (File) {
        const files = [await uploadToGemini(File.path, File.mimetype)];
        const fileData = {
            fileData: {
                mimeType: files[0].mimeType,
                fileUri: files[0].uri
            }
        };
        const chatSession = model.startChat({
          generationConfig,
          history: [
            {
              role: "user",
              parts: [
                {
                  fileData: {
                    mimeType: files[0].mimeType,
                    fileUri: files[0].uri,
                  },
                },
              ],
      
              
            },
            
          ],
        });
        const result = await chatSession.sendMessage(prompt);
        const response = await result.response;
        wrtt = response.text();
    }

  
    
    else {
        result = await userSession.chatSession.sendMessage(prompt);
         const response = await result.response;
        wrtt = response.text();

    }
     userSession.history.push({ sender: 'model', message: wrtt });
     res.json({ wrtt, history: userSession.history, files: req.files });
} catch (error) {
        console.error("Error during API call:", error);
        res.status(500).json({ error: "Failed to get response from API" });
    }
});
   
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});