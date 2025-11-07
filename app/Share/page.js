"use client";
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";



export default function Page() {

  
  const [connectionStatus, setConnectionStatus] = useState("ยังไม่ได้เชื่อมต่อ");
  const [roomId, setRoomId] = useState("");
  const [progress, setProgress] = useState(0);
  const [maxProgress, setMaxProgress] = useState(100);
  const [selectedFileName, setSelectedFileName] = useState("");
  
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const remotePeerIdRef = useRef(null);
  const currentRoomRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // ตัวแปรสำหรับรับไฟล์
  const incomingBuffersRef = useRef([]);
  const incomingFileInfoRef = useRef(null);
  const receivedBytesRef = useRef(0);

  useEffect(() => {
    const SOCKET_URL = "http://192.168.1.101:3001";
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    const iceConfig = {
      iceServers: [
        {
          urls: [
            "stun:stun.relay.metered.ca:80",
            "turn:global.relay.metered.ca:80",
            "turn:global.relay.metered.ca:80?transport=tcp",
            "turn:global.relay.metered.ca:443",
            "turns:global.relay.metered.ca:443?transport=tcp",
          ],
          username: "9c66677d31d8d7374d19fad2",
          credential: "rno9nKuv627d1Z/c",
        },
      ],
    };

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      setConnectionStatus("เชื่อมต่อ Socket.io สำเร็จ");
    });

    socket.on("room-created", ({ roomId }) => {
      console.log("🏠 Room created:", roomId);
      setConnectionStatus(`สร้างห้อง ${roomId} แล้ว - รอคนเข้าร่วม...`);
    });

    socket.on("peer-joined", ({ peerId }) => {
      console.log("👥 Peer joined:", peerId);
      remotePeerIdRef.current = peerId;
      setConnectionStatus("มีคนเข้าห้องแล้ว - กำลังเชื่อมต่อ...");
      setupPeer(true);
      createAndSendOffer(peerId);
    });

    socket.on("joined-success", ({ roomId }) => {
      console.log("✅ Joined room:", roomId);
      setConnectionStatus(`เข้าร่วมห้อง ${roomId} แล้ว - รอการเชื่อมต่อ...`);
      setupPeer(false);
    });

    socket.on("signal", async ({ from, data }) => {
      console.log("📡 Signal from", from, data?.type);
      
      if (!remotePeerIdRef.current) remotePeerIdRef.current = from;

      const pc = pcRef.current;
      if (!pc && data.type !== "offer") {
        setupPeer(false);
      }

      if (data.type === "offer") {
        await pcRef.current.setRemoteDescription({ type: "offer", sdp: data.sdp });
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit("signal", {
          to: from,
          data: { type: "answer", sdp: answer.sdp },
        });
      } else if (data.type === "answer") {
        await pcRef.current.setRemoteDescription({ type: "answer", sdp: data.sdp });
      } else if (data.type === "ice") {
        try {
          await pcRef.current.addIceCandidate(data.candidate);
        } catch (err) {
          console.warn("❌ addIceCandidate error:", err);
        }
      }
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket error:", error);
      setConnectionStatus("เชื่อมต่อ Socket.io ไม่สำเร็จ");
    });

    function setupPeer(isOfferer) {
      if (pcRef.current) return;
      
      const pc = new RTCPeerConnection(iceConfig);
      pcRef.current = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          if (remotePeerIdRef.current) {
            socket.emit("signal", {
              to: remotePeerIdRef.current,
              data: { type: "ice", candidate: e.candidate },
            });
          } else {
            socket.emit("signal", {
              roomId: currentRoomRef.current,
              data: { type: "ice", candidate: e.candidate },
            });
          }
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("🔌 PC connection state:", pc.connectionState);
        if (pc.connectionState === "connected") {
          setConnectionStatus("เชื่อมต่อ WebRTC สำเร็จ - พร้อมส่งไฟล์!");
        } else if (pc.connectionState === "disconnected") {
          setConnectionStatus("การเชื่อมต่อขาดหาย");
        }
      };

      if (isOfferer) {
        const dc = pc.createDataChannel("file");
        dcRef.current = dc;
        setupDataChannel(dc);
      } else {
        pc.ondatachannel = (ev) => {
          dcRef.current = ev.channel;
          setupDataChannel(ev.channel);
        };
      }
    }

    function setupDataChannel(dc) {
      dc.binaryType = "arraybuffer";
      
      dc.onopen = () => {
        console.log("✅ DataChannel open");
        setConnectionStatus("DataChannel เปิดแล้ว - พร้อมส่งไฟล์!");
      };
      
      dc.onclose = () => {
        console.log("❌ DataChannel closed");
        setConnectionStatus("DataChannel ปิดแล้ว");
      };
      
      dc.onmessage = (e) => {
        if (typeof e.data === "string") {
          try {
            const obj = JSON.parse(e.data);
            if (obj.name && obj.size) {
              // เริ่มรับไฟล์
              incomingFileInfoRef.current = obj;
              incomingBuffersRef.current = [];
              receivedBytesRef.current = 0;
              setMaxProgress(obj.size);
              setProgress(0);
              console.log("📥 เริ่มรับไฟล์:", obj.name, obj.size, "bytes");
            } else if (obj.done) {
              // รับไฟล์เสร็จแล้ว
              const blob = new Blob(incomingBuffersRef.current, {
                type: incomingFileInfoRef.current.type,
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = incomingFileInfoRef.current.name;
              a.click();
              URL.revokeObjectURL(url);
              
              console.log("✅ รับไฟล์เสร็จแล้ว:", incomingFileInfoRef.current.name);
              alert(`รับไฟล์ ${incomingFileInfoRef.current.name} เสร็จแล้ว!`);
              
              // reset
              incomingFileInfoRef.current = null;
              incomingBuffersRef.current = [];
              receivedBytesRef.current = 0;
              setProgress(0);
            }
          } catch (err) {
            console.log("⚠️ String message but not JSON:", e.data);
          }
        } else {
          // ArrayBuffer chunk
          incomingBuffersRef.current.push(e.data);
          receivedBytesRef.current += e.data.byteLength;
          
          if (incomingFileInfoRef.current) {
            setProgress(receivedBytesRef.current);
            const percent = ((receivedBytesRef.current / incomingFileInfoRef.current.size) * 100).toFixed(1);
            console.log(`📥 รับไฟล์: ${percent}%`);
          }
        }
      };
    }

    async function createAndSendOffer(peerId) {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      socket.emit("signal", {
        to: peerId,
        data: { type: "offer", sdp: offer.sdp },
      });
    }

    return () => {
      if (dcRef.current) dcRef.current.close();
      if (pcRef.current) pcRef.current.close();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const handleCreateRoom = () => {
    if (!roomId.trim()) {
      alert("กรุณาใส่ Room ID");
      return;
    }
    currentRoomRef.current = roomId;
    socketRef.current.emit("create-room", { roomId });
  };

  const handleJoinRoom = () => {
    if (!roomId.trim()) {
      alert("กรุณาใส่ Room ID");
      return;
    }
    currentRoomRef.current = roomId;
    socketRef.current.emit("join-room", { roomId });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFileName(file.name);
    }
  };

  const handleSendFile = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) {
      alert("กรุณาเลือกไฟล์ก่อน");
      return;
    }
    
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") {
      alert("DataChannel ยังไม่พร้อม! ต้องเชื่อมต่อห้องก่อน");
      return;
    }

    const chunkSize = 64 * 1024; // 64KB
    let offset = 0;

    // ส่ง metadata
    const meta = JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    dc.send(meta);
    
    setMaxProgress(file.size);
    setProgress(0);

    function sendChunk() {
      if (offset >= file.size) {
        dc.send(JSON.stringify({ done: true }));
        console.log("✅ ส่งไฟล์เสร็จแล้ว:", file.name);
        setProgress(file.size);
        alert("ส่งไฟล์เสร็จแล้ว!");
        return;
      }

      const slice = file.slice(offset, offset + chunkSize);
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          dc.send(e.target.result);
          offset += chunkSize;
          setProgress(Math.min(offset, file.size));

          // Backpressure handling
          if (dc.bufferedAmount > 16 * chunkSize) {
            dc.onbufferedamountlow = () => {
              dc.onbufferedamountlow = null;
              sendChunk();
            };
          } else {
            setTimeout(sendChunk, 0);
          }
        } catch (err) {
          console.error("❌ Send failed:", err);
          alert("ส่งไฟล์ล้มเหลว: " + err.message);
        }
      };
      
      reader.readAsArrayBuffer(slice);
    }

    sendChunk();
  };

  const progressPercent = maxProgress > 0 ? ((progress / maxProgress) * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            WebRTC File Share
          </h1>
          <p className="text-gray-600 mb-6">ส่งไฟล์แบบ P2P ผ่าน WebRTC</p>

          {/* Status */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                connectionStatus.includes("พร้อมส่งไฟล์") || connectionStatus.includes("DataChannel เปิด") 
                  ? "bg-green-500" 
                  : connectionStatus.includes("กำลัง") 
                  ? "bg-yellow-500 animate-pulse" 
                  : "bg-gray-400"
              }`}></div>
              <span className="text-sm font-medium text-gray-700">
                {connectionStatus}
              </span>
            </div>
          </div>

          {/* Room Controls */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Room ID
              </label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="ใส่ Room ID (เช่น room123)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={handleCreateRoom}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                สร้างห้อง
              </button>
              <button
                onClick={handleJoinRoom}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                เข้าร่วมห้อง
              </button>
            </div>
          </div>

          {/* File Upload */}
          <div className="border-t border-gray-200 pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              เลือกไฟล์ที่จะส่ง
            </label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="w-full mb-3 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            
            {selectedFileName && (
              <p className="text-sm text-gray-600 mb-3">
                ไฟล์ที่เลือก: <span className="font-medium">{selectedFileName}</span>
              </p>
            )}
            
            <button
              onClick={handleSendFile}
              className="w-full bg-purple-500 hover:bg-purple-600 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              ส่งไฟล์
            </button>
          </div>

          {/* Progress Bar */}
          {progress > 0 && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>ความคืบหน้า</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <h3 className="font-semibold text-yellow-800 mb-2">วิธีใช้งาน:</h3>
            <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
              <li>คนแรกกรอก Room ID แล้วกด สร้างห้อง</li>
              <li>คนที่สองกรอก Room ID เดียวกันแล้วกด เข้าร่วมห้อง</li>
              <li>รอจนเห็นสถานะ พร้อมส่งไฟล์</li>
              <li>เลือกไฟล์แล้วกด ส่งไฟล์</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}