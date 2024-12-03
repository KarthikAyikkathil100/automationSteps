const responses = require('@Helpers/responses');

const { getCloudStorageClient, getVideoIntelligenceClient } = require('@Helpers/index.js')
const {dynamoConnection} = require('@AwsHelpers/DynamoDB/index.js')
// const { axios } = requie('@Helpers/index.js')
const https = require('https'); // Use `http` for non-https URLs
const fs = require('fs');
const path = require('path');

// const axios = require('axios')
// TODO: Delte the file from local system
const handler = async (event, context, callback) => {
  console.log('event => ', event);
  try {
    const routeId = event.route_id
    const jobId = await handleRoute(event.route_id)
    console.log('DONE --')
    return callback(null, {
      route_id: routeId,
      job_id: jobId
    })
  } catch (e) {
    console.log(e);
    return responses.errorResponseWithoutData(
      callback,
      'INTERNAL_SERVER_ERROR',
      0,
      500
    );
  }
};

exports.handler = handler;

// This lambda function will do following
// 1) Connect with dynamo DB and get route details
// 2) Download the file from S3
// 3) Push this file to Google cloud storage
// 4) Call the Google Video Intelligence API to initiate the text blur
async function handleRoute(routeId) {
  try {
    console.log('Finding route => ', routeId)
    const routeData = await getRouteDetails(routeId);
    if (!routeId) {
      throw new Error('Route not found')
    }
    console.log('Route data found => ', routeData)

    const videoUrl = routeData?.videoURL;
    if (!videoUrl) {
      throw new Error('Video url not found')
    }
    console.log('Route data found')

    await downloadFileFromUrl(videoUrl)
    console.log('Video downloaded successfully')

    const fileName = path.basename(videoUrl);
    await uploadVideoToGCS(`/tmp/${fileName}`, 'rtme-videos', fileName)
    console.log('Video uploaded to GCS')
    const jobId = await submitTextDetectionjob('rtme-videos', fileName)
    console.log('Submitted job to Google Video API')
    if (!jobId) {
      throw new Error('Job id not found')
    }
    return jobId
  } catch (e) {
    console.log('Error while handling route')
    console.log(e);
    throw e
  }
}


async function getRouteDetails(routeId) {
  try {
    const routeParams = {
      TableName: 'dev-Routes',
      Key: {
        id: routeId,
      },
      ProjectionExpression: 'id, videoURL',
    };
    const routeData = await dynamoConnection.get(routeParams).promise();
    if (!routeData.Item || Object.keys(routeData.Item).length === 0) {
      return null;
    }
    let data = routeData.Item ?? null;
    return data
  } catch (e) {
    return null
  }
}

async function uploadVideoToGCS(localFilePath, bucketName, destinationPath) {
  try {
      // Instantiate a Google Cloud Storage client
    const storage = await getCloudStorageClient('/automation/google/creds')
    if (!storage) {
      throw new Error('Error while initialising the storage')
    }

    // Reference to the GCS bucket
    const bucket = storage.bucket(bucketName);

    // Reference to the destination file in GCS
    const file = bucket.file(destinationPath);

    return new Promise((resolve, reject) => {
      // Create a stream to upload the file to GCS
      fs.createReadStream(localFilePath)
        .pipe(file.createWriteStream({
          resumable: true, // Enable resumable uploads for large files
          contentType: 'video/mp4', // Set content type (adjust for other file types)
        }))
        .on('finish', () => {
          // When upload is finished, return the URL of the uploaded file
          const fileUrl = `https://storage.googleapis.com/${bucketName}/${destinationPath}`;
          console.log(`File uploaded to ${fileUrl}`);
          resolve(fileUrl); // Return the URL of the uploaded file
        })
        .on('error', (err) => {
          console.error('Error uploading video:', err);
          reject(err); // Reject with the error
        });
    }); 
  } catch (e) {
    console.log('Error while uploading to GCS');
    return null
  }
}


async function downloadFileFromUrl(videoUrl) {
  // Extract the file name from the URL (e.g., "video.mp4")
  const fileName = path.basename(videoUrl);
  
  // The path where the file will be saved in /tmp directory
  const localFilePath = path.join('/tmp', fileName);

  return new Promise((resolve, reject) => {
    // Start the HTTP/HTTPS request to fetch the file
    const file = fs.createWriteStream(localFilePath);

    https.get(videoUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file. Status code: ${response.statusCode}`));
        return;
      }

      // Pipe the response to the local file
      response.pipe(file);

      // Wait for the download to complete
      file.on('finish', () => {
        file.close();
        console.log(`File downloaded successfully to ${localFilePath}`);
        resolve(localFilePath); // Return the local file path
      });
      
      file.on('error', (err) => {
        fs.unlink(localFilePath, () => reject(err)); // Delete the file if an error occurs
      });
    }).on('error', (err) => {
      fs.unlink(localFilePath, () => reject(err)); // Delete the file if an error occurs
    });
  });
}

async function submitTextDetectionjob(bucketName, fileName) {
  try {
    const client = await getVideoIntelligenceClient('/automation/google/creds')
    if (!client) {
      throw new Error('VideoInteligence API could not initialise')
    }
    const inputFileUri = `gs://${bucketName}/${fileName}`
    const outputUri = `gs://${bucketName}/${fileName}.json`
    const textTracking = {
      inputUri: inputFileUri,
      features: ['TEXT_DETECTION'],
      outputUri,
    }
    
    // Perform the face detection request
    const [operation] = await client.annotateVideo(textTracking);
    console.log('Text detection initiated, jobId => ', operation?.name)
    console.log('The output json will be stored in => ', outputUri)
    return operation?.name
  } catch (e) {
    console.log('Error while submiting text blur job')
    console.error(e)
    return null
  }
}