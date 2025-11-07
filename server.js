// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";



// const port = process.env.PORT || 3001; // ใช้ port 3001 เพื่อไม่ชนกับ Next.js (port 3000)
const port = 3001

// สร้าง Express app และ HTTP server
const app = express();
const server = http.createServer(app);

// สร้าง Socket.IO server และเปิดให้ทุก origin เชื่อมได้ (สำหรับ dev)
const io = new Server(server, {
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  },
});

// ใช้ Map เก็บข้อมูลห้องในหน่วยความจำ (roomId => { offerer, answerer })
const rooms = new Map();

// -----------------------------------------------------
// เมื่อมี client เชื่อมต่อเข้ามา
// -----------------------------------------------------
io.on("connection", socket => {
  console.log("✅ socket connected:", socket.id);

  // -----------------------------------------------------
  // เมื่อ client สร้างห้องใหม่
  // -----------------------------------------------------
  socket.on("create-room", ({ roomId }) => {
    console.log("hhh")

    // ถ้ามีห้องนี้อยู่แล้ว ป้องกันการซ้ำ
    if (rooms.has(roomId)) {
      socket.emit("error", { message: "room-already-exists" });
      console.log(`⚠️ room ${roomId} already exists.`);
      return;
    }



    // เพิ่มห้องใหม่ลงใน Map
    rooms.set(roomId, { offerer: socket.id });
    socket.join(roomId);

    console.log("🏠 Room created:", roomId);
    console.log("rooms:", Array.from(rooms.entries()));

    // แจ้งผู้สร้างว่า สร้างห้องสำเร็จ
    socket.emit("room-created", { roomId });
  });

  // -----------------------------------------------------
  // เมื่อ client พยายาม join ห้องที่มีอยู่
  // -----------------------------------------------------
  socket.on("join-room", ({ roomId }) => {
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("error", { message: "room-not-found" });
      console.log(`❌ join failed: room ${roomId} not found.`);
      return;
    }

    if (room.answerer) {
      socket.emit("error", { message: "room-full" });
      console.log(`⚠️ join failed: room ${roomId} is full.`);
      return;
    }

    // เก็บ socket id ของผู้เข้าร่วมใหม่ (answerer)
    room.answerer = socket.id;
    socket.join(roomId);

    console.log(`👥 User ${socket.id} joined room ${roomId}`);

    // แจ้งทั้งสองฝั่ง
    io.to(room.offerer).emit("peer-joined", { peerId: socket.id });
    io.to(room.answerer).emit("joined-success", { roomId });
  });

  // -----------------------------------------------------
  // ส่งต่อข้อความ signaling (offer, answer, ice-candidate)
  // -----------------------------------------------------
  socket.on("signal", ({ roomId, to, data }) => {
    if (to) {
      // ส่งตรงไปยัง peer ที่ต้องการ
      io.to(to).emit("signal", { from: socket.id, data });
      console.log(`📡 signal direct from ${socket.id} to ${to}`);
    } else {
      // ส่ง broadcast ไปยังคนอื่นในห้องเดียวกัน
      socket.to(roomId).emit("signal", { from: socket.id, data });
      console.log(`📡 signal broadcast from ${socket.id} in room ${roomId}`);
    }
  });

  // -----------------------------------------------------
  // เมื่อ client หลุดการเชื่อมต่อ
  // -----------------------------------------------------
  socket.on("disconnect", () => {
    console.log(`⚡ socket disconnected: ${socket.id}`);

    // ลบห้องที่ socket นี้อยู่
    for (const [roomId, room] of rooms.entries()) {
      if (room.offerer === socket.id || room.answerer === socket.id) {
        console.log(`🧹 Cleaning up room ${roomId}`);
        rooms.delete(roomId);

        // แจ้งอีกฝั่งในห้องว่า peer หลุดแล้ว
        socket.to(roomId).emit("peer-left");
      }
    }
  });
});

// -----------------------------------------------------
// เริ่มต้น server
// -----------------------------------------------------
server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Signaling server listening on port ${port}`);
  console.log(`📍 Access at: http://192.168.1.101:${port}`);
});