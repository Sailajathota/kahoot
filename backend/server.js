const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { quizzes } = require('./quizData');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

function generatePIN() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Fetch quizzes
  socket.on('get-quizzes', (callback) => {
    if (typeof callback === 'function') {
      callback({ quizzes: quizzes.map(q => ({ id: q.id, title: q.title })) });
    }
  });

  // Host creates room
  socket.on('create-room', ({ quizId }, callback) => {
    const quiz = quizzes.find(q => q.id === quizId);
    if (!quiz) return callback({ error: "Quiz not found" });

    let pin = generatePIN();
    while (rooms.has(pin)) {
      pin = generatePIN();
    }

    const room = {
      pin,
      quiz,
      hostId: socket.id,
      players: [],
      currentQuestionIndex: -1,
      state: 'lobby', 
      answersThisRound: 0,
      questionStartTime: 0
    };
    rooms.set(pin, room);
    socket.join(pin);
    if (typeof callback === 'function') callback({ success: true, pin, quiz });
  });

  // Player joins room
  socket.on('join-room', ({ pin, name }, callback) => {
    const room = rooms.get(pin);
    if (!room) return typeof callback === 'function' && callback({ error: "Room not found" });
    if (room.state !== 'lobby') return typeof callback === 'function' && callback({ error: "Game already started" });

    const player = {
      id: socket.id,
      name: name || "Anonymous",
      score: 0,
    };
    room.players.push(player);
    socket.join(pin);

    io.to(room.hostId).emit('player-joined', player);
    if (typeof callback === 'function') callback({ success: true, pin, state: room.state });
  });

  // Host starts game
  socket.on('start-game', ({ pin }) => {
    const room = rooms.get(pin);
    if (room && room.hostId === socket.id) {
      room.state = 'question';
      room.currentQuestionIndex = 0;
      room.answersThisRound = 0;
      room.questionStartTime = Date.now();
      const currentQ = room.quiz.questions[0];
      io.to(pin).emit('question-started', {
        questionIndex: room.currentQuestionIndex,
        question: {
          text: currentQ.text,
          options: currentQ.options,
          timeLimit: currentQ.timeLimit
        }
      });
    }
  });

  // Player answers
  socket.on('submit-answer', ({ pin, answerIndex }, callback) => {
    const room = rooms.get(pin);
    if (!room || room.state !== 'question') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const currentQ = room.quiz.questions[room.currentQuestionIndex];
    let isCorrect = (answerIndex === currentQ.correctOption);
    
    if (isCorrect) {
      const timeTaken = (Date.now() - room.questionStartTime) / 1000;
      const timeLimit = currentQ.timeLimit;
      const scoreAdd = Math.max(10, Math.round(1000 * (1 - (timeTaken / (timeLimit * 2)))));
      player.score += scoreAdd;
    }

    room.answersThisRound++;
    
    io.to(room.hostId).emit('player-answered', { answersCount: room.answersThisRound });
    
    if (typeof callback === 'function') callback({ success: true, isCorrect, score: player.score });
  });

  // Host shows leaderboard
  socket.on('show-leaderboard', ({ pin }) => {
    const room = rooms.get(pin);
    if (room && room.hostId === socket.id) {
      room.state = 'leaderboard';
      const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
      const correctAnswer = room.quiz.questions[room.currentQuestionIndex].correctOption;
      io.to(pin).emit('leaderboard', { players: sortedPlayers, correctAnswer });
    }
  });

  // Host moves to next question
  socket.on('next-question', ({ pin }) => {
    const room = rooms.get(pin);
    if (room && room.hostId === socket.id) {
      room.currentQuestionIndex++;
      if (room.currentQuestionIndex >= room.quiz.questions.length) {
        room.state = 'finished';
        const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
        io.to(pin).emit('game-finished', { players: sortedPlayers });
      } else {
        room.state = 'question';
        room.answersThisRound = 0;
        room.questionStartTime = Date.now();
        const currentQ = room.quiz.questions[room.currentQuestionIndex];
        io.to(pin).emit('question-started', {
          questionIndex: room.currentQuestionIndex,
          question: {
            text: currentQ.text,
            options: currentQ.options,
            timeLimit: currentQ.timeLimit
          }
        });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
