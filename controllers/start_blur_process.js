const { axios } = require('@Helpers/index.js')
const axiosInstance = axios.create({
    baseURL: `${process.env.baseURL}`,
    timeout: 5000,
});

const handler = async (event, context, callback) => {
    console.log('event => ', event);
    try {
      const routeId = event.route_id
      const res = await axiosInstance.post('/test/text-blur', {
          route_id: routeId
        })
        if (res.status == 200) {
            return callback(null, {
                submitted: true,
            })
        } else {
            return callback(null, {
                submitted: false,
                route_id: routeId
            })   
        }
    } catch (e) {
      console.log(e);
      callback(e)
    }
};


exports.handler = handler;