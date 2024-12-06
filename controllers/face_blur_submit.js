const responses = require('@Helpers/responses');
const { axios } = require('@Helpers/index.js')
const axiosInstance = axios.create({
    baseURL: `${process.env.baseURL}`,
    timeout: 5000,
});

// TODO: Delte the file from local system
const handler = async (event, context, callback) => {
    try {
        const routeId = event.route_id
        const res = await axiosInstance.post('/face-blur', {
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
        console.log('Error while checking job status')
        console.log(e)
        return responses.errorResponseWithoutData(
            callback,
            'INTERNAL_SERVER_ERROR',
            0,
            500
          );
    }
}

exports.handler = handler;