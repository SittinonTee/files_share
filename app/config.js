const config = {
  app: {
    port: process.env.PORT || 3000,
  },
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || "http://192.168.1.101:3001",
  // ,
  // db: {
  //     main: {
  //         host: process.env.DB_HOST,
  //         database: process.env.DB_NAME,
  //         user: process.env.DB_USER,
  //         password: process.env.DB_PASSWORD,
  //         connectionLimit: 10
  //     }
  // },
  // s3:{
  //     credentials:{
  //         accessKeyId:process.env.ACCESS_KEY,
  //         secretAccessKey:process.env.SECRET_KEY
  //     },
  //     endpoint:process.env.ENDPOINT,
  //     bucket: process.env.BUCKET
  // }
};

export default config