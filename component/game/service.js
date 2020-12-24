const { InsufficientStorage } = require("http-errors");
const {
  messageModel,
  gameModel,
  roomModel,
  userModel,
} = require("../../database/schema");
const { service: serviceIO } = require("../../socket.io");

const service = {
  createNewGame: async (name, player1) => {
    try {
      const newGame = await new gameModel({
        name,
        player1,
      }).save();
      return { success: true, message: "Success", id: newGame._id };
    } catch (e) {
      console.log("[ERROR]: ", e.message);
      return { success: false, message: "Failed" };
    }
  },

  createNewRoom: async (idUser, name, password) => {
    try {
      const newRoom = await new roomModel({
        name,
        password: password ? password : null,
        player1: idUser,
      }).save();

      const username = await userModel.findOne({ id: idUser });
      const { idRoom, gameCurrent, player2 } = newRoom;

      serviceIO.updateAddRoomOnline({
        no: 0,
        id: idRoom,
        name,
        status: !gameCurrent ? "waiting" : "playing",
        isLock: password ? true : false,
        player1: username.username,
        player2,
      });

      return {
        success: true,
        message: "Create new room success",
        data: { id: idRoom },
      };
    } catch (e) {
      console.log("[ERROR]: ", e.message);
      return { success: false, message: "Failed" };
    }
  },

  accessGame: async (idGame, idPlayer2) => {
    try {
      const game = await gameModel.findOne({ _id: idGame });
      if (game && !game.player2) {
        game.player2 = idPlayer2;
        game.save();
      }
      return { success: true, message: "Success" };
    } catch (e) {
      console.log("[ERROR]: ", e.message);
      return { success: false, message: "Failed" };
    }
  },

  sendMessage: async ({ idGame, idUser, message }) => {
    try {
      const newMessage = await new messageModel({
        idGame,
        idUser,
        message,
      }).save();

      return { success: true, message: "Send message success" };
    } catch (e) {
      console.log(`[ERROR-GAME]: ${e.message}`);
      return { success: false, message: "Send message failed" };
    }
  },

  getMessage: async ({ idRoom, idUser }) => {
    try {
      const listMessage = await messageModel.find({ idRoom });

      const room = await roomModel
        .findOne({ idRoom })
        .select(["-_id", "player1", "player2"]);

      const player1 = await userModel
        .findOne({ id: room.player1 })
        .select(["-_id", "id", "username"]);

      const player2 = await userModel
        .findOne({ id: room.player2 })
        .select(["-_id", "id", "username"]);

      const idUserReplace = idUser || player1.id;

      if (listMessage) {
        return {
          success: true,
          message: "Get message success",

          listMessage: listMessage.map((item) => {
            const time = new Date(item.created_at);
            const hours =
              time.getHours() > 10
                ? `${time.getHours()}`
                : `0${time.getHours()}`;
            const minutes =
              time.getMinutes() > 10
                ? `${time.getMinutes()}`
                : `0${time.getMinutes()}`;

            if (idUserReplace === item.idUser) {
              return {
                contentMessage: item.message,
                username:
                  player1.id === idUserReplace
                    ? player1.username
                    : player2.username,
                type: "sender",
                time: `${hours}:${minutes}`,
              };
            } else {
              return {
                contentMessage: item.message,
                username:
                  player1.id === item.idUser
                    ? player1.username
                    : player2.username,
                type: "receiver",
                time: `${hours}:${minutes}`,
              };
            }
          }),
        };
      }

      return { success: true, message: "Send message success", listMessage };
    } catch (e) {
      console.log(`[ERROR-GAME]: ${e.message}`);
      return {
        success: false,
        message: "Send message failed",
        listMessage: null,
      };
    }
  },

  getGame: async (idGame) => {
    try {
      const game = await gameModel.findOne({ id: idGame });
      return { success: true, message: "Success", game };
    } catch (e) {
      console.log("[ERROR]: ", e.message);
      return { success: false, message: "Failed" };
    }
  },

  makeAMove: async (idGame, idPlayer, position) => {
    try {
      const game = await gameModel.findOne({ _id: idGame });
      if (game) {
        // Kiem tra da co nguoi choi 2 chua
        if (!game.player2) throw new Error("Vui long cho nguoi choi 2");
        // Lay thu tu cua nguoi choi
        let playerNumber =
          idPlayer === game.player1 ? 1 : idPlayer === game.player2 ? 2 : null;
        if (game.nextMove !== playerNumber)
          throw new Error("Nguoi choi khong duoc di nuoc di nay");
        // Kiem tra o da co nguoi di chua
        if (game.squares.find((square) => square.position === position))
          throw new Error("O nay da co nguoi di");
        // Update nguoi di ke tiep
        game.nextMove = (playerNumber % 2) + 1;
        // Update ban co
        game.squares.push({
          position,
          checker: playerNumber,
        });
        game.save();
        return {
          success: true,
          message: "Success",
          move: { position, checker: playerNumber },
        };
      } else {
        throw new Error("Ban choi khong ton tai");
      }
    } catch (e) {
      console.log("[ERROR]: ", e.message);
      return { success: false, message: "Failed" };
    }
  },

  getRoom: async (idUser, idRoom) => {
    try {
      console.log("idRoom:", idRoom);
      const room = await roomModel.findOne({ idRoom });

      let becomePlayer = false;
      let isPlayer = 0;

      if (room.player1 !== idUser && room.player2 === null) {
        room.player2 = idUser;
        await room.save();
        becomePlayer = true;
      }

      if (room.player1 === idUser) {
        isPlayer = 1;
      }

      if (room.player2 === idUser) {
        isPlayer = 2;
      }

      if (idUser === room.player1 || idUser === room.player2) {
        becomePlayer = true;
      }

      const player1 =
        (await userModel
          .findOne({ id: room.player1 })
          .select(["-_id", "id", "username"])) || null;
      const player2 =
        (await userModel
          .findOne({ id: room.player2 })
          .select(["-_id", "id", "username"])) || null;

      const roomResponse = {
        becomePlayer,
        id: idRoom,
        player1,
        player2,
        password: room.password,
        isPlayer,
      };

      return {
        success: true,
        message: "Success",
        data: { room: roomResponse },
      };
    } catch (e) {
      return { success: false, message: "Failed", data: {} };
    }
  },
};

module.exports = service;
