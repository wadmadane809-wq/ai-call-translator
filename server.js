const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// قاعدة بيانات مؤقتة للمستخدمين والإحالات (في الذاكرة - قابلة للربط لاحقاً بـ MongoDB)
const usersDB = {};

// 1️⃣ نقطة تسجيل الحساب وتوليد رابط الإحالة
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "يرجى إدخال البريد وكلمة المرور" });
    }

    if (!usersDB[email]) {
        usersDB[email] = {
            email: email,
            password: password,
            minutes: 5, // 5 دقائق تجريبية مجانية مبدئية
            refCode: 'REF_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            invitedCount: 0
        };
    }

    res.json({
        success: true,
        message: "تم حفظ الحساب بنجاح",
        user: {
            email: usersDB[email].email,
            minutes: usersDB[email].minutes,
            refCode: usersDB[email].refCode,
            invitedCount: usersDB[email].invitedCount
        }
    });
});

// 2️⃣ نقطة رصد دخول الأصدقاء وزيادة الدقائق تلقائياً (نظام الإحالة الآمن)
app.post('/api/referral/join', (req, res) => {
    const { refCode } = req.body;
    const user = Object.values(usersDB).find(u => u.refCode === refCode);

    if (user) {
        user.invitedCount += 1;
        
        // إذا وصل العدد إلى 10 أصدقاء، تضاف 10 دقائق مجانية فوراً لحسابه
        if (user.invitedCount === 10) {
            user.minutes += 10;
            console.log(`🎁 تم اكتمال 10 أصدقاء للمستخدم ${user.email} وإضافة 10 دقائق مجانية!`);
        }

        return res.json({
            success: true,
            invitedCount: user.invitedCount,
            totalMinutes: user.minutes
        });
    }

    res.status(404).json({ success: false, message: "رابط الإحالة غير صحيح" });
});

// 3️⃣ نظام الاتصال الفوري والترجمة (Socket.io) لغرف المكالمات
io.on('connection', (socket) => {
    console.log('⚡ متصل جديد بالغرفة:', socket.id);

    socket.on('join-room', ({ roomId, lang }) => {
        socket.join(roomId);
        console.log(`المستخدم ${socket.id} انضم للغرفة ${roomId} بلغة: ${lang}`);
    });

    socket.on('audio-stream', (data) => {
        // تمرير الصوت والترجمة للطرف الآخر في نفس الغرفة فوراً
        socket.to(data.roomId).emit('translated-audio', data);
    });

    socket.on('disconnect', () => {
        console.log('❌ انقطع الاتصال:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});