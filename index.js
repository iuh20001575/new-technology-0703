require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');

const app = express();
const upload = multer({
    limits: { fieldSize: 2000000 },
    fileFilter: (req, file, cb) => {
        const fileTypes = /png|jpg|jpeg|gif$/;

        if (fileTypes.test(file.originalname) && fileTypes.test(file.mimetype))
            return cb(null, true);

        return cb(null, false);
    },
});

const options = {
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
};

const s3 = new AWS.S3(options);
const dynamoDB = new AWS.DynamoDB.DocumentClient(options);
const s3Name = process.env.BUCKET_NAME;
const dynamoDbName = process.env.DYNAMODB_NAME;

const PORT = 3000;

app.use(express.static('./templates'));
app.set('view engine', 'ejs');
app.set('views', './templates');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', async (req, res) => {
    try {
        const result = await dynamoDB
            .scan({
                TableName: dynamoDbName,
            })
            .promise();

        res.render('index', { products: result.Items });
    } catch (error) {
        console.error(`error::`, error);

        res.status(500).send('Error when get data from DynamoDB.');
    }
});

app.post('/add', upload.single('image'), (req, res) => {
    const { id, name, quantity, price } = req.body;
    const file = req.file;

    if (!file)
        return res.status(401).send('File invalid, only accept image file!');

    const fileName = `${id}_${new Date().getTime()}.${file.originalname
        .split('.')
        .at(-1)}`;

    if (!Number.isInteger(+quantity))
        return res.status(401).send('Quantity must be integer');
    if (Number.isNaN(+price))
        return res.status(401).send('Price must be number');

    s3.upload(
        {
            Bucket: s3Name,
            Key: fileName,
            Body: file.buffer,
        },
        (error, data) => {
            if (error) {
                console.error(error);

                return res.status(500).send('Error');
            }

            dynamoDB.put(
                {
                    TableName: dynamoDbName,
                    Item: {
                        id,
                        name,
                        quantity: +quantity,
                        price: +price,
                        image: data.Location,
                    },
                },
                (error, data) => {
                    if (error) {
                        console.error(error);

                        return res.status(500).send('Error: Id existed');
                    }

                    res.redirect('/');
                },
            );
        },
    );
});

app.post('/delete', upload.none(), async (req, res) => {
    const { ids } = req.body;

    const result = await Promise.all(
        (Array.isArray(ids) ? ids : [ids]).map((id) =>
            dynamoDB
                .delete({
                    TableName: dynamoDbName,
                    Key: {
                        id,
                    },
                })
                .promise(),
        ),
    );

    const length = result.length;
    for (let index = 0; index < length; index++) {
        const item = result[index];

        if (Object.keys(item).length) {
            console.error(item);

            return res.status(500).send('Error');
        }
    }

    res.redirect('/');
});

app.get('/test', async (req, res) => {
    const result = await dynamoDB
        .scan({
            TableName: dynamoDbName,
            FilterExpression: 'price > :price',
            ExpressionAttributeValues: { ':price': 0 },
        })
        .promise();

    res.render('index', { products: result.Items });
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
