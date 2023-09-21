#version 310 es
precision highp float;
layout(location = 0) in vec2 vTexCoord;
layout(location = 0) out vec4 FragColor;
layout(set = 0, binding = 2) uniform highp sampler2D Source;

layout(std140, set = 0, binding = 0) uniform UBO
{
	mat4 MVP;
   float contrast;         /* 2.0f;      */ 
   float paper_white_nits; /* 200.0f;    */
   float max_nits;         /* 1000.0f;   */
   float expand_gamut;     /* 1.0f;      */ 
   float inverse_tonemap;
   float hdr10;
} global;

/* Inverse Tonemap section */
#define kMaxNitsFor2084     10000.0f
#define kEpsilon            0.0001f
#define kLumaChannelRatio   0.25f

vec3 InverseTonemap(vec3 sdr)
{
   vec3 hdr;
      
   if (global.inverse_tonemap > 0.0f)
   { 
      sdr = pow(abs(sdr), vec3(global.contrast / 2.2f));       /* Display Gamma - needs to be determined by calibration screen */

      float luma = dot(sdr, vec3(0.2126, 0.7152, 0.0722));  /* Rec BT.709 luma coefficients - https://en.wikipedia.org/wiki/Luma_(video) */

      /* Inverse reinhard tonemap */
      float maxValue             = (global.max_nits / global.paper_white_nits) + kEpsilon;
      float elbow                = maxValue / (maxValue - 1.0f);                          
      float offset               = 1.0f - ((0.5f * elbow) / (elbow - 0.5f));              
   
      float hdrLumaInvTonemap    = offset + ((luma * elbow) / (elbow - luma));
      float sdrLumaInvTonemap    = luma / ((1.0f + kEpsilon) - luma);                     /* Convert the srd < 0.5 to 0.0 -> 1.0 range */

      float lumaInvTonemap       = (luma > 0.5f) ? hdrLumaInvTonemap : sdrLumaInvTonemap;
      vec3 perLuma               = sdr / (luma + kEpsilon) * lumaInvTonemap;

      vec3 hdrInvTonemap         = offset + ((sdr * elbow) / (elbow - sdr));         
      vec3 sdrInvTonemap         = sdr / ((1.0f + kEpsilon) - sdr);                       /* Convert the srd < 0.5 to 0.0 -> 1.0 range */

      vec3 perChannel            = vec3(sdr.x > 0.5f ? hdrInvTonemap.x : sdrInvTonemap.x,
                                     sdr.y > 0.5f ? hdrInvTonemap.y : sdrInvTonemap.y,
                                     sdr.z > 0.5f ? hdrInvTonemap.z : sdrInvTonemap.z);

      hdr = mix(perLuma, perChannel, vec3(kLumaChannelRatio));
   }
   else
   {
      hdr = sdr;
   }

   return hdr;
}

/* HDR10 section */
#define kMaxNitsFor2084     10000.0f

const mat3 k709to2020 = mat3 (
   0.6274040f, 0.3292820f, 0.0433136f,
   0.0690970f, 0.9195400f, 0.0113612f,
   0.0163916f, 0.0880132f, 0.8955950f);

/* START Converted from (Copyright (c) Microsoft Corporation - Licensed under the MIT License.)  https://github.com/microsoft/Xbox-ATG-Samples/tree/master/Kits/ATGTK/HDR */
const mat3 kExpanded709to2020 = mat3 (
    0.6274040f, 0.3292820f, 0.0433136f,
    0.0457456,  0.941777,   0.0124772,
   -0.00121055, 0.0176041,  0.983607);

//NTSC (1953)/ITU-R BT.470 - 525
 const mat3 kNTSC1953_to_2020 = mat3 (
   0.924130283352921f, 0.058040878058827f, 0.017828838588251f,
   0.081832452209371f, 0.839996416103710f, 0.078171131686919f,
   -0.003138728266940f, 0.033216715568834f, 0.969922012698106f);

//   0.906538f, 0.074810f, 0.018652f,
//   0.076155f, 0.860656f, 0.063189f,
//   -0.002015f, 0.041546  0.960469f);

//NTSC (1987)/SMPTE 240M/SMPTE C
 const mat3 k601_to_2020 = mat3 (
   0.595254206376441f, 0.349313919749775f, 0.055431873873783f,
   0.081243661805292f, 0.891503295602217f, 0.027253042592490f,
   0.015512341244385f, 0.081911642143068f, 0.902576016612547f);

//Pal/Secam/ITU-R BT.470 - 625
 const mat3 kPAL_to_2020 = mat3 (
   0.655036776701967f, 0.302160964978908f, 0.042802258319126f,
   0.072140555698383f, 0.916631128820964f, 0.011228315480653f,
   0.017113370439452f, 0.097853469923833f, 0.885033159636715f);

//EBU Tech. 3213-E
 const mat3 k3213E_to_2020 = mat3 (
   0.656656353779129f, 0.300719063748279f, 0.042624582472592f,
   0.072525428085101f, 0.916271070705580f, 0.011203501209319f,
   0.017188500243598f, 0.097872586557247f, 0.884938913199155f);

//ITU-R BT.709
 const mat3 kalt709_to_2020 = mat3 (
   0.627403895934699f, 0.329283038377884f, 0.043313065687417f,
   0.069097289358232f, 0.919540395075458f, 0.011362315566309f,
   0.016391438875150f, 0.088013307877226f, 0.895595253247624f);

//DCI-P3
 const mat3 kaDCIP3_to_2020 = mat3 (
   0.707334754484899f, 0.247569002167623f, 0.045096243347478f,
   0.036801714143967f, 0.965390705258538f, -0.002192419402504f,
   0.000222194187031f, 0.029426016456367f, 0.970351789356603f);

//Display P3/P3-D65
 const mat3 kaDisplayP3_to_2020 = mat3 (
   0.753833034361721f, 0.198597369052617f, 0.047569596585662f,
   0.045743848965358f, 0.941777219811693f, 0.012478931222948f,
   -0.001210340354518f, 0.017601717301090f, 0.983608623053428f);

//sRGB
 const mat3 ksRGB_to_2020 = mat3 (
   0.627441372057978f, 0.329297459521909f, 0.043351458394495f,
   0.069027617147078f, 0.919580666887028f, 0.011361422575401f,
   0.016364235071681f, 0.088017162471727f, 0.895564972725983f);

//Adobe RGB (1998)
 const mat3 kAdobeRGB1998_to_2020 = mat3 (
   0.877337599133789f, 0.077497709099687f, 0.045174670424343f,
   0.096613889523141f, 0.891520398792844f, 0.011846866967978f,
   0.022920009813905f, 0.043037949654269f, 0.934044659100325f);

//Adobe Wide Gamut RGB
 const mat3 kAdobeWGRGB_to_2020 = mat3 (
   1.107073553496249f, -0.153227847929002f, 0.046154294432753f,
   -0.050931551529117f, 1.130629708912274f, -0.079698157383157f,
   0.004751406104069f, 0.043194090984263f, 0.952054502911668f);

//Apple RGB
 const mat3 kAppleRGB_to_2020 = mat3 (
   0.678529391873470f, 0.268103222741389f, 0.053367385385141f,
   0.096031750282729f, 0.877730211467603f, 0.026238038249668f,
   0.021192740493379f, 0.109846519921590f, 0.868960739585031f);

//ITU-R BT.2020
 const mat3 k2020_to_2020 = mat3 (
   1.000000000000000f, 0.000000000000000f, 0.000000000000000f,
   0.000000000000000f, 1.000000000000000f, -0.000000000000000f,
   0.000000000000000f, 0.000000000000000f, 1.000000000000000f);

// NTSC-J P22
 const mat3 kNTSCJP22_to_2020 = mat3 (
   0.691014f, 0.261287f, 0.047700f,
   0.109646f, 0.876813f, 0.013541f,
   0.014382f, 0.096629f, 0.888989f);

// P22_80
 const mat3 kP2280_to_2020 = mat3 (
   0.702409f, 0.260434f, 0.037157f,
   0.087800f, 0.889849f, 0.022351f,
   0.004390f, 0.077212f, 0.918398f);

// P22 improved with tinted phosphors
 const mat3 kP2290_to_2020 = mat3 (
   0.621792f, 0.339128f, 0.039080f,
   0.057073f, 0.919420f, 0.023508f,
   -0.000938f, 0.035014f, 0.965924f);

// RPTV (Rear Projection TV) for NTSC-U late 90s, early 00s
 const mat3 kRPTV_to_2020 = mat3 (
   0.504405f, 0.451465f, 0.044129f,
   0.059729f, 0.908159f, 0.032112f,
   0.010633f, 0.062627f, 0.926741f);

// XXA (P22 sulﬁde/silicate/phosphate)
 const mat3 kXXA_to_2020 = mat3 (
   0.867034f, 0.096021f, 0.036945f,
   0.064650f, 0.936157f, -0.000808f,
   -0.001711f, 0.036583f, 0.965127f);

// XXB (P22 all-sulﬁde)
 const mat3 kXXB_to_2020 = mat3 (
   0.747111f, 0.224558f, 0.028332f,
   0.075382f, 0.925237f, -0.000619f,
   -0.001995f, 0.261872f, 0.740122f);

// XXC (P22 sulﬁde/vanadate)
 const mat3 kXXC_to_2020 = mat3 (
   0.661541f, 0.304499f, 0.033961f,
   0.047782f, 0.952961f, -0.000742f,
   -0.001264f, 0.114094f, 0.887170f);

// XXD (P22 sulﬁde/oxysulﬁde)
 const mat3 kXXD_to_2020 = mat3 (
   0.526084f, 0.418310f, 0.055607f,
   0.073322f, 0.901471f, 0.025207f,
   0.001097f, 0.052624f, 0.946279f);

//Conrac 7211N19
 const mat3 kConrac_to_2020 = mat3 (
   0.848016f, 0.103509f, 0.048476f,
   0.090261f, 0.893984f, 0.015755f,
   0.030765f, 0.064658f, 0.904577f);

//Sony Trinitron KV-20M20
 const mat3 kTT86_to_2020 = mat3 (
   0.678529f, 0.268103f, 0.053367f,
   0.096032f, 0.877730f, 0.026238f,
   0.021193f, 0.109847f, 0.868961f);

//SMPTE-C - Measured Average Phosphor (1979-1994)
 const mat3 kMA7994_to_2020 = mat3 (
   0.708152f, 0.257311f, 0.034538f,
   0.103842f, 0.879177f, 0.016980f,
   0.002749f, 0.076286f, 0.920965f);

//NTSC-J - Standard Phosphor
 const mat3 kNTSCJSt_to_2020 = mat3 (
   0.693529f, 0.259060f, 0.047411f,
   0.115249f, 0.869342f, 0.015409f,
   0.019484f, 0.095806f, 0.884711f);

vec3 LinearToST2084(vec3 normalizedLinearValue)
{
   vec3 ST2084 = pow((0.8359375f + 18.8515625f * pow(abs(normalizedLinearValue), vec3(0.1593017578f))) / (1.0f + 18.6875f * pow(abs(normalizedLinearValue), vec3(0.1593017578f))), vec3(78.84375f));
   return ST2084;  /* Don't clamp between [0..1], so we can still perform operations on scene values higher than 10,000 nits */
}
/* END Converted from (Copyright (c) Microsoft Corporation - Licensed under the MIT License.)  https://github.com/microsoft/Xbox-ATG-Samples/tree/master/Kits/ATGTK/HDR */

vec3 Hdr10(vec3 hdr)
{
   vec3 hdr10;

   if (global.hdr10 > 0.0f)
   {
      /* Now convert into HDR10 */
      vec3 rec2020 = hdr * k709to2020;

      if (global.expand_gamut > 0.0f)
         rec2020        = hdr * kNTSC1953_to_2020;

      vec3 linearColour = rec2020 * (global.paper_white_nits / kMaxNitsFor2084);
      hdr10             = LinearToST2084(linearColour);
   }
   else
      hdr10 = hdr;

   return hdr10;
}

void main()
{
   vec4 sdr = texture(Source, vTexCoord);
   vec4 hdr = vec4(InverseTonemap(sdr.rgb), sdr.a);    
   FragColor = vec4(Hdr10(hdr.rgb), hdr.a); 
}
