const {Router} = require('express')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer');
require('dotenv').config();

const router = Router()

//Conexión a la base de datos
async function connectBD() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE
        });
        //Si la conexión funciona, nos da por consola que está conectado
        console.log('Conectado a la base de datos')
        return connection
    //Si no, nos da el error
    } catch (error) {
        console.error('Error conectándose a la base de datos:', error.code)
        console.error('Detalles:', error)
        throw error
    }
}

let user_regis = false //Variable para el inicio de sesión, al principio está en false parano poder entrar a ciertas rutas bloquedas
let currentEmail = '' //Guarda el email que se registra en el login
let currentUser = '' //Guarda el usuario que se registra en el login

//Chekeo de que todo funciona correctamente en la ejecución del código
console.log("OK")

//Creamos el servicio de correo electrónico
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

//Ruta de inicio
router.get('/', (req, res) => {

    res.render('inicio')

})

//Ruta del blog
router.get('/blog', async (req, res) => {
    let connection = await connectBD()

    const [rows] = await connection.execute('SELECT * FROM blog_posts');
        
    let userId
    if (user_regis) {
        const [userData] = await connection.execute('SELECT id FROM skate_users WHERE username = ?', [currentUser]);
        userId = userData[0].id;
    }

    // Obtener la lista de favoritos del usuario si está registrado
    let favorites = [];
    if (userId) {
        const [userFavorites] = await connection.execute('SELECT post_id FROM user_favorites WHERE user_id = ?', [userId]);
        favorites = userFavorites.map(favorite => favorite.post_id);
    }

    res.render('blog_posts', { blog_posts: rows, user_regis, favorites });
});



// Ruta para agregar un post a favoritos
router.post('/favorite', async (req, res) => {
    //Si el usuario no está registrado, se le envía al login
    if (!user_regis) {
        res.redirect('/login');
        return;
    }

    //Coge el ID del post
    const { postId } = req.body;
    const connection = await connectBD();

    // Desde la variable del usuario actual, se coge el id de usuario
    const [userData] = await connection.execute('SELECT id FROM skate_users WHERE username = ?', [currentUser]);
    const userId = userData[0].id;

    // Verifica si el post ya está en la lista de favoritos del usuario registrado
    const [existingFavorite] = await connection.execute('SELECT * FROM user_favorites WHERE user_id = ? AND post_id = ?', [userId, postId]);
    if (existingFavorite.length > 0) {
        // Si ya está en la lista de favoritos, no se añade de nuevo
        res.redirect('/blog');
        return;
    }

    // Inserta el post favorito en la base de datos
    await connection.execute('INSERT INTO user_favorites (user_id, post_id) VALUES (?, ?)', [userId, postId]);

    res.redirect('/blog');
});


// Ruta para eliminar un post de favoritos
router.post('/favorite/delete/:postId', async (req, res) => {
    if (!user_regis) {
        res.redirect('/login');
        return;
    }

    const { postId } = req.params;
    const connection = await connectBD();

    const [userData] = await connection.execute('SELECT id FROM skate_users WHERE username = ?', [currentUser]);
    const userId = userData[0].id;

    // Elimina el post favorito de la base de datos y del perfil de usuario
    await connection.execute('DELETE FROM user_favorites WHERE user_id = ? AND post_id = ?', [userId, postId]);

    res.redirect('/cuenta');
});


//Ruta para el post que se ha hecho click en el blog
router.get('/post/:nombre', async(req, res) => {

    const {nombre} = req.params
    const connection = await connectBD()
    //Coge los campos del post de la base de datos
    const [rows, fields] = await connection.execute("SELECT * FROM blog_posts WHERE nombre = ?", [nombre])

    const post = rows[0]

    //Coge los comentarios del post de la base de datos
    const [comments] = await connection.execute("SELECT * FROM blog_comments WHERE post_id = ?", [post.id])

    res.render('post', {post, comments, user_regis, currentUser})

})

//Ruta para añadir un comentario del usuario registrado
router.post('/post/:nombre/comment', async(req, res) => {
    if (!user_regis) {
        res.redirect('/login');
        return;
    }

    //Se coge el nombre del post
    const { nombre } = req.params;
    //Coge la información que se ha puesto en el comentario
    const { comentario } = req.body;
    const connection = await connectBD();

    const [postInfo] = await connection.execute("SELECT id FROM blog_posts WHERE nombre = ?", [nombre]);
    const postId = postInfo[0].id;

    const [userData] = await connection.execute('SELECT id FROM skate_users WHERE username = ?', [currentUser]);
    const userId = userData[0].id;

    // Insertar el comentario en la base de datos y en el post
    await connection.execute('INSERT INTO blog_comments(post_id, user_id, username, comentario) VALUES (?,?,?,?)', [postId, userId, currentUser, comentario]);

    //Redirecciona al post al que se ha comentado
    res.redirect(`/post/${nombre}`);
});


//Ruta para eliminar un comentario del usuario registrado
router.post('/post/:nombre/comment/:commentId/delete', async(req, res) => {
    //Se coge el nombre del post y el id del comentario que queremos borrar
    const { nombre, commentId } = req.params;
    const connection = await connectBD();

    // Verifica si el comentario pertenece al usuario registrado
    const [comment] = await connection.execute('SELECT * FROM blog_comments WHERE id = ?', [commentId]);
    if (comment.length > 0 && comment[0].username === currentUser) {
        //Si es así, lo borra de la base de datos y del post
        await connection.execute('DELETE FROM blog_comments WHERE id = ?', [commentId]);
    }

    res.redirect(`/post/${nombre}`);
});

//Ruta para ir a la ayuda
router.get('/ayuda', (req, res) => {

    res.render('contacto')

})

//Ruta para registrarse
router.get('/login', (req, res) => {

    res.render('login')

})

//Ruta para registrarse con el usuario introducido
router.post('/login', async(req, res) => {

    //Coge el nombre de usuario y la contraseña que se ha introducido
    const {username, pass} = req.body

    const connection = await connectBD()

    //Comprueba que el usuario exista
    const [rows, fields] = await connection.execute('SELECT * FROM skate_users WHERE username = ?', [username])

    if(rows.length > 0) {

        const user = rows[0]
        //Desencripta la contraseña de la base de datos y comprueba si es igual a la que se ha introducido
        const passMatch = await bcrypt.compare(pass, user.pass)

        //Si la contraseña coincide
        if(passMatch) {

            user_regis = true //Se pone a true la variable de registro
            currentUser = user.username //El usuario actual es el usuario registrado
            currentEmail = user.email //El correo actual es el del usuario registrado
            res.redirect('/') //Se redirecciona a inicio

        }
        else{

            //Si la contraseña no coincide, salta un error 400
            res.status(400).render('datosIncorrectos')

        }

    }
    else {

        //Si algún otro parámetro introducido no es correcto, salta un error 400
        res.status(400).render('datosIncorrectos')

    }

})

//Ruta para registrarse
router.get('/register', (req, res) => {

    res.render('register')

})

//Ruta para registrar un nuevo usuario
router.post('/register', async(req, res) => {
    const { username, email, pass, confirmPass } = req.body; //Coge los campos introducidos en el formulario
    const encriptPass = await bcrypt.hash(pass, 10); //Encripta la contraseña en la base de datos
    const connection = await connectBD();

    //Si las contraseñas no coinciden, salta un error 400
    if(pass != confirmPass) {

        return res.status(400).render('contraseñaIncorrecta')

    }

    // Verifica si el correo electrónico o el nombre de usuario ya están registrados
    const [existingUser] = await connection.execute('SELECT * FROM skate_users WHERE email = ? OR username = ?', [email, username]);
    if (existingUser.length > 0) {
        // Si el correo o el usuario ya está registrado, salta un error 400
        if (existingUser[0].email === email) {
            return res.status(400).render('emailRegistrado');
        } else {
            return res.status(400).render('usuarioRegistrado')
        }
    }

    //Inserta un nuevo usuario en la base de datos
    await connection.execute('INSERT INTO skate_users (username, email, pass) VALUES (?,?,?)', [username, email, encriptPass]);

    //Opciones del email de confirmación de registro
    const mailOptions = {
        from: 'contactskatespoint@gmail.com',
        to: email,
        subject: 'Confirmación de registro',
        text: `Hola ${username}, tu cuenta ha sido creada correctamente en SkateSpo(in)t.
No es necesario que respondas a este correo
Disfruta de nuestro contenido ahora: http://localhost:3000/`
    };

    //Comprobación de errores
    transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Correo electrónico de confirmación enviado a: ' + email);
        }
    });

    res.redirect('/login');
});


//Ruta para acceder a la cuenta
router.get('/cuenta', (req, res) => {

    //Si el usuario está registrado, se va al perfil
    if(user_regis) {

        res.redirect('/cuenta/'+currentUser)

    }
    //Si no, se le lleva al login
    else {

        res.redirect('/login')

    }

})

//Ruta para acceder a la cuenta del usuario
router.get('/cuenta/:username', async (req, res) => {
    //Si el usuario registrado y el nombre de usuario que se ha pedido en la url son el mismo, se lleva al perfil
    if (user_regis && req.params.username === currentUser) {
        const connection = await connectBD();

        //Carga los posts favoritos del usuario
        const [favorites] = await connection.execute(`SELECT bp.* FROM blog_posts bp JOIN user_favorites uf ON bp.id = uf.post_id WHERE uf.user_id = (SELECT id FROM skate_users WHERE username = ?)`, [currentUser]);

        res.render('cuenta', { username: currentUser, currentEmail, favorites });
    } 
    //Si el usuario y la ruta no coincide, se lleva al login
    else {
        res.redirect('/login');
    }
});


//Ruta para cerrar sesión
router.get('/log_out', (req, res) => {

    //La variable de sesión se vuelve a poner en false
    user_regis = false

    res.redirect('/')

})

//Ruta para acceder al reseteo de contraseña
router.get('/new_pass', (req, res) => {

    //Si el usuario está registrado, se lleva a la ruta donde se resetea la contraseña de ese perfil registrado
    if(user_regis) {

        res.redirect('/new_pass/'+currentUser)

    }
    //Si el usuario no está registrado, se prohibe el acceso a esa dirección
    else {

        res.sendStatus(403)

    }

})

//Ruta para acceder al reseteo de contraseña del usuario
router.get('/new_pass/:username', async(req, res) => {

    //Se coge el usuario de la dirección
    const {username} = req.params
    const connection = await connectBD()

    const [usuario] = await connection.execute('SELECT * FROM skate_users WHERE username = ?', [username])

    //Si el usuario está registrado y el usuario registrado es el mismo que el de la ruta, puede acceder
    if(user_regis == true && username == currentUser) {

        res.render('new_pass', {username})

    }
    //Si no, se prohibe el acceso a esa dirección
    else {

        res.sendStatus(403)

    }

})

//Ruta para el reseto de contraseña del usuario actual
router.post('/new_pass/:username', async (req, res) => {
    const { username } = req.params; //Se coge el usuario de la dirección
    const { pass } = req.body; //Se coge la nueva contraseña introducida
    const connection = await connectBD();
    const encriptPass = await bcrypt.hash(pass, 10); //Se encripta la contraseña en la base de datos
    await connection.execute('UPDATE skate_users SET pass = ? WHERE username = ?', [encriptPass, username]); //Se actualiza la contraseña del usuario en la base de datos

    //Se envía un correo de que la contraseña del usuario ha sido cambiada
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: currentEmail,
        subject: 'Cambio de contraseña',
        text: `Hola ${username}, le informamos de que su contraseña ha sido cambiada`
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Correo electrónico de confirmación enviado a: ' + currentEmail);
        }
    });

    res.redirect('/cuenta');
});

//Ruta para el error 404
router.use((req, res, next) => {

    res.status(404).render('404')
    next()

})

module.exports = router