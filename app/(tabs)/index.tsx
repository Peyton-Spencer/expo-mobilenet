import { Image, StyleSheet, Platform } from 'react-native';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Button, View, Text, } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import * as tf from '@tensorflow/tfjs';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { TouchableOpacity } from 'react-native';
import * as cocossd from '@tensorflow-models/coco-ssd';

export default function HomeScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [predictions, setResult] = useState<string[]>([]);
  const [imageUri, setImageUri] = useState('');
  const image = useRef<Image>(null);
  const camViewRef = useRef<CameraView>(null);
  const [model, setModel] = useState<cocossd.ObjectDetection | null>(null);
  const [tfState, setTfState] = useState('');

  const loadModel = async () => {
    try {
      console.log('Loading TFJS model...');
      setTfState('Loading TFJS model...');
      await tf.ready();
      console.log('TFJS ready');
      setTfState('TFJS ready!');
      const model = await cocossd.load();
      console.log('CocoSSD loaded');
      setModel(model);
      setTfState('CocoSSD ready!');

    } catch (err) {
      console.log(err);
    }
  };

  const classifyImage = async (imageUri: string) => {
    try {
      // Resize the image to speed up processing
      console.log('Resizing image...', imageUri);
      const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 224, height: 224 } }], // Adjust the size as needed
        { base64: true, compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      );
      setImageUri(manipResult.uri);
      // delete the original image
      await FileSystem.deleteAsync(imageUri);
      console.log('Image resized', manipResult.uri);

      // Convert the base64 string to Uint8Array
      const imageData = manipResult.base64;
      console.log('Image data');
      if (!imageData) {
        console.log('No image data');
        return;
      }

      const imageDataBuffer = tf.util.encodeString(imageData, 'base64').buffer;
      console.log('Image data buffer');
      const imageDataArrayBuffer = new Uint8Array(imageDataBuffer);
      console.log('Image data array buffer');
      const imageTensor = decodeJpeg(imageDataArrayBuffer);
      console.log('Image tensor');

      if (!model) {
        console.log('Model not loaded');
        return;
      }

      // This warning suppression was included in tfjs-models/blazeface,src/face.ts
      // TODO: Once tf.image.nonMaxSuppression includes a flag to suppress console
      // warnings for not using async version, pass that flag in.
      const savedConsoleWarnFn = console.warn;
      console.warn = () => { };
      const prediction = await model.detect(imageTensor);
      console.warn = savedConsoleWarnFn;
      console.log('Prediction');

      if (prediction && prediction.length > 0) {
        console.log('got prediction', prediction);
        setResult(prediction.map(p => `${p.class}: ${formatBoundingBox(p.bbox)}: (${p.score.toFixed(3)})`));
      } else {
        console.log('No prediction');
        setResult([]);
      }
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    loadModel();
  }, []);

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center' }}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }


  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/react-logo.png')}
          style={styles.reactLogo}
        />
      }>

      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
        <ThemedText>{tfState}</ThemedText>
      </ThemedView>

      <ThemedView>

        <CameraView
          ref={camViewRef}
          style={styles.camera}
          facing={facing}
        >
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={toggleCameraFacing}>
              <Text style={styles.text}>Flip Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={async () => {
              const sizes = await camViewRef.current?.getAvailablePictureSizesAsync()
              console.log('Available picture sizes:', sizes);
              const pic = await camViewRef.current?.takePictureAsync()
              if (pic) {
                console.log(pic.uri);
                setImageUri(pic.uri);
              }
            }}>
              <Text style={styles.text}>Capture</Text>
            </TouchableOpacity>
          </View>
        </CameraView>

        {imageUri !== '' && <ThemedView>
          <ThemedText type='subtitle'>Captured image:</ThemedText>
          <Image
            ref={image}
            source={{ uri: imageUri }}
            style={{ width: 200, height: 200 }}
          />
          <TouchableOpacity onPress={async () => {
            if (imageUri) {
              await classifyImage(imageUri);
            } else {
              console.log('No image to analyze');
            }
          }
          }>
            <Text style={styles.text}>Analyze Photo</Text>
          </TouchableOpacity>
        </ThemedView>}

        {predictions.length > 0 && (
          <>
            {predictions.map((prediction, index) => (
              <ThemedText key={index} type="subtitle">
                {prediction}
              </ThemedText>
            ))}
          </>
        )}
        {predictions.length === 0 && (
          <ThemedText type="subtitle">No objects detected</ThemedText>
        )}

      </ThemedView>

    </ParallaxScrollView >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    margin: 64,
  },
  button: {
    flex: 1,
    alignSelf: 'flex-end',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});

function formatBoundingBox(box: number[]) {
  return `(${box[0].toFixed(2)}, ${box[1].toFixed(2)}) - (${box[2].toFixed(2)}, ${box[3].toFixed(2)})`;
}